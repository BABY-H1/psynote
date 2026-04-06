import React, { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCreateCourse, useUpdateCourse } from '../../../api/useCourses';
import { useAuthStore } from '../../../stores/authStore';
import { useToast } from '../../../shared/components';
import { Plus, Trash2, GripVertical, Upload, ArrowLeft, FileText, Video, Image, X } from 'lucide-react';

// ─── Types ──────────────────────────────────────────────────────

interface ChapterAttachment {
  fileName: string;
  fileUrl: string;
  fileType: string;
  fileSize: number;
}

interface ChapterData {
  id: string;
  title: string;
  description: string;
  attachments: ChapterAttachment[];
}

interface ManualCourseEditorProps {
  courseId?: string;
  onClose?: () => void;
}

const COURSE_TYPES = [
  { value: 'micro_course', label: '微课' },
  { value: 'series', label: '系列课' },
  { value: 'workshop', label: '工作坊' },
] as const;

const TARGET_AUDIENCES = [
  { value: 'student', label: '学生' },
  { value: 'parent', label: '家长' },
  { value: 'teacher', label: '教师' },
  { value: 'counselor', label: '咨询师' },
] as const;

// ─── File upload helper ─────────────────────────────────────────

async function uploadFile(
  file: File,
): Promise<{ url: string; fileName: string; fileType: string; fileSize: number }> {
  const orgId = useAuthStore.getState().currentOrgId;
  const formData = new FormData();
  formData.append('file', file);
  const response = await fetch(`/api/orgs/${orgId}/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${useAuthStore.getState().accessToken}` },
    body: formData,
  });
  if (!response.ok) throw new Error('Upload failed');
  return response.json();
}

function getFileIcon(fileType: string) {
  if (fileType.startsWith('video/')) return <Video className="h-4 w-4 text-purple-500" />;
  if (fileType.startsWith('image/')) return <Image className="h-4 w-4 text-green-500" />;
  return <FileText className="h-4 w-4 text-blue-500" />;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

let chapterIdCounter = 0;
function makeChapterId() {
  return `ch_${Date.now()}_${++chapterIdCounter}`;
}

// ─── Component ──────────────────────────────────────────────────

export function ManualCourseEditor({ courseId, onClose }: ManualCourseEditorProps) {
  const navigate = useNavigate();
  const createCourse = useCreateCourse();
  const updateCourse = useUpdateCourse();
  const { toast } = useToast();

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [courseType, setCourseType] = useState<string>('micro_course');
  const [targetAudience, setTargetAudience] = useState<string>('student');
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [saving, setSaving] = useState(false);

  // ─── Chapter management ─────────────────────────────────────

  function addChapter() {
    setChapters((prev) => [
      ...prev,
      { id: makeChapterId(), title: '', description: '', attachments: [] },
    ]);
  }

  function removeChapter(index: number) {
    setChapters((prev) => prev.filter((_, i) => i !== index));
  }

  function updateChapter<K extends keyof ChapterData>(index: number, key: K, value: ChapterData[K]) {
    setChapters((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [key]: value };
      return next;
    });
  }

  function moveChapter(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= chapters.length) return;
    setChapters((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function removeAttachment(chapterIndex: number, attachmentIndex: number) {
    setChapters((prev) => {
      const next = [...prev];
      const ch = { ...next[chapterIndex] };
      ch.attachments = ch.attachments.filter((_, i) => i !== attachmentIndex);
      next[chapterIndex] = ch;
      return next;
    });
  }

  // ─── File upload per chapter ────────────────────────────────

  async function handleFilesForChapter(chapterIndex: number, files: FileList | File[]) {
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      try {
        const result = await uploadFile(file);
        const attachment: ChapterAttachment = {
          fileName: result.fileName || file.name,
          fileUrl: result.url,
          fileType: file.type || 'application/octet-stream',
          fileSize: result.fileSize || file.size,
        };
        setChapters((prev) => {
          const next = [...prev];
          const ch = { ...next[chapterIndex] };
          ch.attachments = [...ch.attachments, attachment];
          next[chapterIndex] = ch;
          return next;
        });
      } catch {
        toast(`文件 "${file.name}" 上传失败`, 'error');
      }
    }
  }

  // ─── Submit ─────────────────────────────────────────────────

  async function handleSave(status: 'draft' | 'published') {
    if (!title.trim()) {
      toast('请输入课程标题', 'error');
      return;
    }

    setSaving(true);
    try {
      // Build chapter content with attachment links embedded as markdown
      // TODO: When a chapter attachments API is available, post attachments separately
      const chaptersPayload = chapters.map((ch, i) => {
        let content = ch.description || '';
        if (ch.attachments.length > 0) {
          content += '\n\n---\n**附件:**\n';
          for (const att of ch.attachments) {
            content += `- [${att.fileName}](${att.fileUrl}) (${formatFileSize(att.fileSize)})\n`;
          }
        }
        return {
          title: ch.title || `第 ${i + 1} 章`,
          content,
          sortOrder: i,
        };
      });

      const payload: Record<string, unknown> = {
        title: title.trim(),
        description: description.trim(),
        category: category.trim() || undefined,
        courseType,
        targetAudience,
        creationMode: 'manual',
        status,
        chapters: chaptersPayload,
      };

      if (courseId) {
        await updateCourse.mutateAsync({ courseId, ...payload } as any);
        toast(status === 'published' ? '课程已发布' : '草稿已保存', 'success');
      } else {
        await createCourse.mutateAsync(payload as any);
        toast(status === 'published' ? '课程已发布' : '草稿已保存', 'success');
      }

      if (onClose) {
        onClose();
      } else {
        navigate(-1);
      }
    } catch {
      toast('保存失败，请重试', 'error');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (onClose) {
      onClose();
    } else {
      navigate(-1);
    }
  }

  // ─── Render ─────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          <button
            onClick={handleCancel}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-500 transition-colors"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-xl font-semibold text-slate-800">
            {courseId ? '编辑课程' : '手动创建课程'}
          </h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 pt-6 space-y-6">
        {/* ── Section 1: Basic Info ─────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-5">
          <h2 className="text-lg font-semibold text-slate-700">课程基本信息</h2>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              课程标题 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入课程标题"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">课程描述</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="简要描述课程内容和目标"
              rows={3}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">分类</label>
            <input
              type="text"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="例如：心理健康、情绪管理"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Course Type */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">课程类型</label>
            <div className="flex gap-3">
              {COURSE_TYPES.map((t) => (
                <label
                  key={t.value}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    courseType === t.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="courseType"
                    value={t.value}
                    checked={courseType === t.value}
                    onChange={() => setCourseType(t.value)}
                    className="sr-only"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          {/* Target Audience */}
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-2">目标受众</label>
            <div className="flex gap-3 flex-wrap">
              {TARGET_AUDIENCES.map((a) => (
                <label
                  key={a.value}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border cursor-pointer text-sm transition-colors ${
                    targetAudience === a.value
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="targetAudience"
                    value={a.value}
                    checked={targetAudience === a.value}
                    onChange={() => setTargetAudience(a.value)}
                    className="sr-only"
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* ── Section 2: Chapters ───────────────────────────── */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-700">课程章节</h2>
            <button
              onClick={addChapter}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-600 text-sm font-medium hover:bg-blue-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              添加章节
            </button>
          </div>

          {chapters.length === 0 && (
            <div className="text-center py-12 text-slate-400 text-sm">
              暂无章节，点击上方按钮添加
            </div>
          )}

          {chapters.map((chapter, chapterIdx) => (
            <ChapterCard
              key={chapter.id}
              index={chapterIdx}
              chapter={chapter}
              total={chapters.length}
              onChange={(key, value) => updateChapter(chapterIdx, key, value)}
              onRemove={() => removeChapter(chapterIdx)}
              onMoveUp={() => moveChapter(chapterIdx, -1)}
              onMoveDown={() => moveChapter(chapterIdx, 1)}
              onFilesSelected={(files) => handleFilesForChapter(chapterIdx, files)}
              onRemoveAttachment={(attIdx) => removeAttachment(chapterIdx, attIdx)}
            />
          ))}
        </div>

        {/* ── Section 3: Actions ────────────────────────────── */}
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleCancel}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-medium hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={() => handleSave('draft')}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg border border-blue-300 text-blue-600 bg-blue-50 text-sm font-medium hover:bg-blue-100 transition-colors disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存草稿'}
          </button>
          <button
            onClick={() => handleSave('published')}
            disabled={saving}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {saving ? '发布中...' : '发布课程'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Chapter Card sub-component ───────────────────────────────

interface ChapterCardProps {
  index: number;
  chapter: ChapterData;
  total: number;
  onChange: <K extends keyof ChapterData>(key: K, value: ChapterData[K]) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onFilesSelected: (files: FileList | File[]) => void;
  onRemoveAttachment: (attachmentIndex: number) => void;
}

function ChapterCard({
  index,
  chapter,
  total,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  onFilesSelected,
  onRemoveAttachment,
}: ChapterCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        onFilesSelected(e.dataTransfer.files);
      }
    },
    [onFilesSelected],
  );

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        onFilesSelected(e.target.files);
        e.target.value = '';
      }
    },
    [onFilesSelected],
  );

  return (
    <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-slate-50/50">
      {/* Chapter header */}
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-1 pt-1.5 text-slate-400">
          <GripVertical className="h-4 w-4" />
        </div>
        <span className="flex items-center justify-center h-7 w-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold shrink-0 mt-0.5">
          {index + 1}
        </span>
        <div className="flex-1 space-y-3">
          {/* Title */}
          <input
            type="text"
            value={chapter.title}
            onChange={(e) => onChange('title', e.target.value)}
            placeholder={`第 ${index + 1} 章标题`}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
          />
          {/* Description */}
          <textarea
            value={chapter.description}
            onChange={(e) => onChange('description', e.target.value)}
            placeholder="章节描述（可选）"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none bg-white"
          />

          {/* File upload zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${
              dragOver
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-300 hover:border-slate-400 bg-white'
            }`}
          >
            <Upload className={`h-6 w-6 mx-auto mb-1 ${dragOver ? 'text-blue-500' : 'text-slate-400'}`} />
            <p className="text-sm text-slate-500">点击上传或拖拽文件</p>
            <p className="text-xs text-slate-400 mt-1">支持 PPT, PDF, 视频, 音频, 图片</p>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".ppt,.pptx,.pdf,.mp4,.mp3,.wav,.webm,.ogg,.jpg,.jpeg,.png,.gif,.webp"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>

          {/* Uploaded file list */}
          {chapter.attachments.length > 0 && (
            <div className="space-y-1.5">
              {chapter.attachments.map((att, attIdx) => (
                <div
                  key={attIdx}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-sm"
                >
                  {getFileIcon(att.fileType)}
                  <span className="flex-1 truncate text-slate-700">{att.fileName}</span>
                  <span className="text-xs text-slate-400 shrink-0">{formatFileSize(att.fileSize)}</span>
                  <button
                    onClick={() => onRemoveAttachment(attIdx)}
                    className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Chapter actions */}
        <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onMoveUp}
            disabled={index === 0}
            className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="上移"
          >
            ↑
          </button>
          <button
            onClick={onMoveDown}
            disabled={index === total - 1}
            className="px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="下移"
          >
            ↓
          </button>
          <button
            onClick={onRemove}
            className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
            title="删除章节"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ManualCourseEditor;
