/**
 * Phase 9α — Content Block Renderer
 *
 * The C-side counterpart to the counselor's ContentBlockPanel. Renders an
 * ordered list of content blocks (video / audio / rich text / pdf / quiz /
 * reflection / worksheet / check-in) and lets the participant complete them.
 *
 * Each block sub-component is responsible for:
 *   - showing the content
 *   - capturing the participant's response (where applicable)
 *   - calling onSubmit(blockId, response) with the answer
 *
 * The shell handles loading existing responses and dispatching to the right
 * sub-component by blockType.
 */
import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  type ContentBlockType,
  type CourseContentBlock,
  type GroupSessionBlock,
  type EnrollmentBlockResponse,
  type CrisisResource,
} from '@psynote/shared';
import { api } from '@client/api/client';
import { useAuthStore } from '@client/stores/authStore';

import {
  VideoBlockView,
  AudioBlockView,
  RichTextBlockView,
  PdfBlockView,
  QuizBlockView,
  ReflectionBlockView,
  WorksheetBlockView,
  CheckInBlockView,
} from './blocks';
import { CrisisModal } from './CrisisModal';

type BlockRecord = (CourseContentBlock | GroupSessionBlock) & { payload: any };

interface Props {
  /** Either a course chapter id or a group scheme session id. */
  parentType: 'course' | 'group';
  parentId: string;
  /** The enrollment id this consumption is recorded under. */
  enrollmentId: string;
  enrollmentType: 'course' | 'group';
}

interface SubmitResult {
  response: EnrollmentBlockResponse;
  crisis: { severity: 'critical' | 'warning'; resources: CrisisResource[] } | null;
}

export function ContentBlockRenderer({
  parentType, parentId, enrollmentId, enrollmentType,
}: Props) {
  const orgId = useAuthStore((s) => s.currentOrgId);
  const qc = useQueryClient();
  const [crisis, setCrisis] = React.useState<SubmitResult['crisis']>(null);

  // Load all blocks for the parent (server filters out facilitator-only here only by visibility,
  // not by caller role — for now we filter client-side because the portal user's role is
  // implicit from the route, and the server endpoint is shared with the counselor).
  const { data: blocks = [], isLoading } = useQuery({
    queryKey: ['portal-content-blocks', orgId, parentType, parentId],
    queryFn: () =>
      api.get<BlockRecord[]>(
        `/orgs/${orgId}/content-blocks?parentType=${parentType}&parentId=${parentId}`,
      ),
    enabled: !!orgId && !!parentId,
  });

  // Load existing responses for this enrollment so we know what's already done.
  const { data: responses = [] } = useQuery({
    queryKey: ['portal-enrollment-responses', orgId, enrollmentId, enrollmentType],
    queryFn: () =>
      api.get<EnrollmentBlockResponse[]>(
        `/orgs/${orgId}/enrollment-responses?enrollmentId=${enrollmentId}&enrollmentType=${enrollmentType}`,
      ),
    enabled: !!orgId && !!enrollmentId,
  });

  // Map block id → existing response (so views can show "completed" state and
  // pre-fill saved answers).
  const responseByBlock = React.useMemo(() => {
    const m: Record<string, EnrollmentBlockResponse> = {};
    for (const r of responses) m[r.blockId] = r;
    return m;
  }, [responses]);

  const submit = useMutation({
    mutationFn: async (vars: { blockId: string; response: unknown | null }): Promise<SubmitResult> => {
      return api.post<SubmitResult>(
        `/orgs/${orgId}/client/enrollment-responses`,
        {
          enrollmentId,
          enrollmentType,
          blockId: vars.blockId,
          response: vars.response,
        },
      );
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['portal-enrollment-responses'] });
      if (result.crisis) setCrisis(result.crisis);
    },
  });

  // Filter out facilitator-only blocks for portal viewers (participants).
  // The server returns all blocks regardless of role; portal is always a participant.
  const visibleBlocks = blocks.filter(
    (b) => b.visibility === 'participant' || b.visibility === 'both',
  );
  const sorted = [...visibleBlocks].sort((a, b) => a.sortOrder - b.sortOrder);

  if (isLoading) {
    return <div className="text-sm text-slate-400 py-8 text-center">加载中…</div>;
  }
  if (sorted.length === 0) {
    return (
      <div className="text-sm text-slate-400 py-8 text-center">
        本节暂无可消费的内容
      </div>
    );
  }

  function handleSubmit(blockId: string, response: unknown | null) {
    submit.mutate({ blockId, response });
  }

  return (
    <div className="space-y-4">
      {sorted.map((block) => (
        <div key={block.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <BlockViewSwitch
            block={block}
            existing={responseByBlock[block.id] ?? null}
            onSubmit={(response) => handleSubmit(block.id, response)}
          />
        </div>
      ))}

      {crisis && (
        <CrisisModal
          severity={crisis.severity}
          resources={crisis.resources}
          onClose={() => setCrisis(null)}
        />
      )}
    </div>
  );
}

// ─── Sub-component dispatcher ───────────────────────────────────────

interface BlockViewProps<P = any> {
  payload: P;
  existing: EnrollmentBlockResponse | null;
  onSubmit: (response: unknown | null) => void;
}

function BlockViewSwitch({
  block, existing, onSubmit,
}: {
  block: BlockRecord;
  existing: EnrollmentBlockResponse | null;
  onSubmit: (response: unknown | null) => void;
}) {
  const blockType = block.blockType as ContentBlockType;
  const props: BlockViewProps = { payload: block.payload, existing, onSubmit };

  switch (blockType) {
    case 'video':      return <VideoBlockView {...props} />;
    case 'audio':      return <AudioBlockView {...props} />;
    case 'rich_text':  return <RichTextBlockView {...props} />;
    case 'pdf':        return <PdfBlockView {...props} />;
    case 'quiz':       return <QuizBlockView {...props} />;
    case 'reflection': return <ReflectionBlockView {...props} />;
    case 'worksheet':  return <WorksheetBlockView {...props} />;
    case 'check_in':   return <CheckInBlockView {...props} />;
    default:           return <div className="p-4 text-sm text-slate-400">未知内容类型</div>;
  }
}
