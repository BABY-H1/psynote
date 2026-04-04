export function downloadEpisodeZip(episodeId: string, title: string, notes: any[], results: any[] | undefined) {
  let content = `个案记录导��: ${title}\n导出时间: ${new Date().toLocaleString('zh-CN')}\n\n`;

  content += `${'='.repeat(50)}\n会谈记录 (${notes.length}次)\n${'='.repeat(50)}\n\n`;
  notes.forEach((note, i) => {
    content += `--- ���${notes.length - i}次 (${note.sessionDate}) ---\n`;
    if (note.summary) content += `摘要: ${note.summary}\n`;
    if (note.subjective) content += `S: ${note.subjective}\n`;
    if (note.objective) content += `O: ${note.objective}\n`;
    if (note.assessment) content += `A: ${note.assessment}\n`;
    if (note.plan) content += `P: ${note.plan}\n`;
    if (note.fields) {
      Object.entries(note.fields).forEach(([k, v]) => { content += `${k}: ${v}\n`; });
    }
    content += '\n';
  });

  if (results && results.length > 0) {
    content += `${'='.repeat(50)}\n评估记录 (${results.length}次)\n${'='.repeat(50)}\n\n`;
    results.forEach((r: any) => {
      content += `--- ${new Date(r.createdAt).toLocaleDateString('zh-CN')} ---\n`;
      if (r.totalScore != null) content += `总分: ${r.totalScore}\n`;
      if (r.dimensionScores) {
        Object.entries(r.dimensionScores as Record<string, number>).forEach(([k, v]) => {
          content += `  ${k}: ${v}\n`;
        });
      }
      content += '\n';
    });
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}_${new Date().toISOString().slice(0, 10)}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}
