import { useOpenUrl } from "@coinbase/onchainkit/minikit";

export function AppHeader() {
  const openUrl = useOpenUrl();

  return (
    <>
      {/* Logo - centered on page */}
      <div className="w-full flex justify-center items-center">
        <div className="flex flex-col items-center w-[200px]">
          <img src="/logo2.png" alt="TactiBall Logo" className="h-42 w-full" />
        </div>
      </div>

      {/* How to Play link */}
      <div className="w-full max-w-md flex justify-end mb-3">
        <button
          onClick={() => openUrl(`${window.location.origin}/rules-of-game`)}
          className="flex items-center gap-1 text-sm text-gray-300 hover:text-white underline transition-colors"
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-3a1 1 0 00-.867.5 1 1 0 11-1.731-1A3 3 0 0113 8a3.001 3.001 0 01-2 2.83V11a1 1 0 11-2 0v-1a1 1 0 011-1 1 1 0 100-2zm0 8a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
          </svg>
          How to Play?
        </button>
      </div>
    </>
  );
}