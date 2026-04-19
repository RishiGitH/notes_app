import { AlertCircle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { type ReactNode } from "react";

interface ErrorAlertProps {
  title?: string;
  message: string;
  retry?: ReactNode; // Optional retry button slot
}

export function ErrorAlert({
  title = "Something went wrong",
  message,
  retry,
}: ErrorAlertProps) {
  return (
    <Alert variant="destructive" className="my-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription className="flex items-center gap-3">
        {message}
        {retry && <span>{retry}</span>}
      </AlertDescription>
    </Alert>
  );
}
