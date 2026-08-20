import { useEffect, useRef, useState } from "react";
import { Upload, FileText, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";
import { HelpTooltip } from "../guidance/help-tooltip";
import { getHelpControl } from "../../lib/guidance-content";
import type { GuestCsvImportResult } from "../../hooks/use-guests";

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (file: File) => void;
  isImporting: boolean;
  result?: GuestCsvImportResult;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  onImport,
  isImporting,
  result,
}: CsvImportDialogProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importHelp = getHelpControl("guests-import");

  useEffect(() => {
    if (open) {
      return;
    }

    setSelectedFile(null);
  }, [open]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setSelectedFile(file);
  }

  function handleImport() {
    onImport(selectedFile!);
  }

  function handleDone() {
    onOpenChange(false);
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <div className="flex items-center gap-2">
            <DialogTitle>Import Guests from CSV</DialogTitle>
            <HelpTooltip content={importHelp?.tooltip}>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border text-xs text-muted hover:text-foreground"
                aria-label="Help: CSV import"
              >
                ?
              </button>
            </HelpTooltip>
          </div>
        </DialogHeader>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-5" />
              <span>{result.imported} guests imported</span>
            </div>

            {result.errors.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-destructive">Errors:</p>
                <ul className="space-y-1">
                  {result.errors.map((err) => (
                    <li
                      key={`row-${err.row}`}
                      className="flex items-start gap-2 text-sm text-destructive"
                    >
                      <AlertCircle className="size-4 mt-0.5 shrink-0" />
                      <span>
                        Row {err.row}: {err.reason}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleDone}>Done</Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed border-muted rounded-lg p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              {selectedFile ? (
                <>
                  <FileText className="size-8 text-primary" />
                  <span className="text-sm font-medium">
                    {selectedFile.name}
                  </span>
                </>
              ) : (
                <>
                  <Upload className="size-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Drop your CSV here or click to upload
                  </span>
                </>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleFileChange}
            />

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={handleCancel}>
                Cancel
              </Button>
              <Button
                onClick={handleImport}
                disabled={!selectedFile || isImporting}
              >
                {isImporting ? "Importing..." : "Import"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
