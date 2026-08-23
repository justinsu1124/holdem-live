const SUIT_GLYPH: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };

export function Card({ code, size = 'md' }: { code: string; size?: 'sm' | 'md' | 'lg' }) {
  const rank = code[0] === 'T' ? '10' : code[0];
  const suit = code[1];
  const red = suit === 'h' || suit === 'd';
  return (
    <div className={`card card-${size} ${red ? 'card-red' : 'card-black'}`}>
      <span className="card-rank">{rank}</span>
      <span className="card-suit">{SUIT_GLYPH[suit]}</span>
    </div>
  );
}

export function CardBack({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  return <div className={`card card-${size} card-back`} />;
}
