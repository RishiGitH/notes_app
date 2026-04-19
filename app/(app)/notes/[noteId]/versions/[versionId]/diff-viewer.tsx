"use client";

import ReactDiffViewer from "react-diff-viewer-continued";

interface DiffViewerProps {
  oldContent: string;
  newContent: string;
  oldTitle: string;
  newTitle: string;
}

export function DiffViewer({
  oldContent,
  newContent,
  oldTitle,
  newTitle,
}: DiffViewerProps) {
  return (
    <div className="rounded-md border overflow-hidden text-sm">
      <ReactDiffViewer
        oldValue={oldContent}
        newValue={newContent}
        splitView={true}
        leftTitle={oldTitle}
        rightTitle={newTitle}
        useDarkTheme={false}
        hideLineNumbers={false}
      />
    </div>
  );
}
