export default function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 animate-pulse pt-4">
      {[1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="glass-card h-[104px] flex flex-col justify-center gap-3"
        >
          <div className="h-3 w-3/4 bg-white/10 rounded-full mx-auto" />
          <div className="h-5 w-1/2 bg-white/15 rounded-full mx-auto" />
        </div>
      ))}
    </div>
  );
}
