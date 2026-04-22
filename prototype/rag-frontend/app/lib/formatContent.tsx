export function renderFormattedContent(content: string) {
  const lines = content.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, lineIndex) => {
        if (!line.trim()) {
          return <div className="h-1" key={`empty-${lineIndex}`} />;
        }
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        return (
          <p className="leading-relaxed" key={`line-${lineIndex}`}>
            {parts.map((part, partIndex) => {
              if (part.startsWith("**") && part.endsWith("**")) {
                return (
                  <strong key={`part-${lineIndex}-${partIndex}`}>
                    {part.slice(2, -2)}
                  </strong>
                );
              }
              return <span key={`part-${lineIndex}-${partIndex}`}>{part}</span>;
            })}
          </p>
        );
      })}
    </div>
  );
}
