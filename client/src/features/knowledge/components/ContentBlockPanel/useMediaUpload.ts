/**
 * Phase 9α — Thin wrapper around the existing generic upload endpoint.
 *
 * The upload module at /api/orgs/:orgId/upload already handles file storage
 * and MIME/size validation. We just wrap it with useMutation so block editors
 * can trigger uploads consistently.
 */
import { useMutation } from '@tanstack/react-query';
import { api } from '../../../../api/client';
import { useAuthStore } from '../../../../stores/authStore';

interface UploadResult {
  url: string;
  fileName: string;
  fileType: string;
  fileSize: number;
}

export function useMediaUpload() {
  return useMutation({
    mutationFn: async (file: File): Promise<UploadResult> => {
      const orgId = useAuthStore.getState().currentOrgId;
      if (!orgId) throw new Error('No current org');
      const formData = new FormData();
      formData.append('file', file);
      return api.uploadFile<UploadResult>(`/orgs/${orgId}/upload`, formData);
    },
  });
}
