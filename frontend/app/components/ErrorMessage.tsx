// ErrorMessage.tsx
interface ErrorMessageProps {
  error: string;
  onRetry: () => void;
}

export function ErrorMessage({ error, onRetry }: ErrorMessageProps) {
  return (
    <div className="p-4 text-center">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Your Team</h3>
      </div>
      <p className="text-red-500 text-sm mb-3">{error}</p>
      <button
        onClick={onRetry}
        className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors text-sm"
      >
        Retry
      </button>
    </div>
  );
}