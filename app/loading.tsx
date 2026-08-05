export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 border-4 border-[#53D6FF]/30 border-t-[#53D6FF] rounded-full animate-spin" />
        <p className="text-[#A9B8C6] text-sm">Loading...</p>
      </div>
    </div>
  );
}
