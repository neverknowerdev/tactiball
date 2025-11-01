// LoadingSpinner.tsx
export function LoadingSpinner() {
  return (
    <div className="p-4 text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
      <p className="text-sm text-gray-600">Loading team information...</p>
    </div>
  );
}