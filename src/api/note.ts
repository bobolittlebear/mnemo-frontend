import axios from "axios";
export const updateNote = async (
  noteId: string,
  data: { content: string; title: string },
  options?: { signal?: AbortSignal },
) => {
  await axios.put(`/api/notes/${noteId}`, data, {
    signal: options?.signal,
  });
};
