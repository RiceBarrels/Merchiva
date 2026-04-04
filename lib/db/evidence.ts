import { createClient } from "@/lib/supabase/client";

export interface TaskEvidence {
  id: string;
  userId: string;
  organizationId: string;
  roleTaskId: string;
  date: string;
  fileUrl: string;
  fileType: string;
  createdAt: string;
}

export async function uploadEvidence(
  file: File,
  roleTaskId: string,
  organizationId: string
): Promise<TaskEvidence> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const ext = file.name.split(".").pop() ?? "bin";
  const path = `${user.id}/${roleTaskId}/${Date.now()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from("task-evidence")
    .upload(path, file);
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: { publicUrl } } = supabase.storage
    .from("task-evidence")
    .getPublicUrl(path);

  let fileType = "file";
  if (file.type.startsWith("image/")) fileType = "image";
  else if (file.type.startsWith("video/")) fileType = "video";

  const { data, error } = await supabase
    .from("task_evidence")
    .insert({
      user_id: user.id,
      organization_id: organizationId,
      role_task_id: roleTaskId,
      file_url: publicUrl,
      file_type: fileType,
    })
    .select()
    .single();
  if (error) throw error;

  return {
    id: data.id,
    userId: data.user_id,
    organizationId: data.organization_id,
    roleTaskId: data.role_task_id,
    date: data.date,
    fileUrl: data.file_url,
    fileType: data.file_type,
    createdAt: data.created_at,
  };
}
