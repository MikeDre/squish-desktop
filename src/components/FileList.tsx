import { FileRow } from "./FileRow";
import { Summary } from "./Summary";
import type { FileEntry, BatchResult } from "../types";
import "./FileList.css";

interface FileListProps {
  files: FileEntry[];
  batchResult: BatchResult | null;
}

export function FileList({ files, batchResult }: FileListProps) {
  if (files.length === 0) return null;

  return (
    <div className="file-list">
      {batchResult && <Summary result={batchResult} />}
      <div className="file-list__rows">
        {files.map((file) => (
          <FileRow key={file.id} file={file} />
        ))}
      </div>
    </div>
  );
}
