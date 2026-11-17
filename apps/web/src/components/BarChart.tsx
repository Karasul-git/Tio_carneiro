import { useMemo, useState } from 'react';

/**
 * Gráfico de barras verticais de uma série (sem legenda: o título nomeia a série).
 * Barras com topo arredondado, apoiadas na linha de base, 2px de espaço entre elas,
 * grade discreta, valor ao tocar/passar o mouse e alternativa em tabela.
 */
export type BarDatum = { key: string; label: string; value: number };

function niceMax(v: number) {
  if (v <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

export default function BarChart({
  title,
  data,
  format = (n) => String(n),
  height = 180,
}: {
  title: string;
  data: BarDatum[];
  format?: (n: number) => string;
  height?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = useMemo(() => niceMax(Math.max(0, ...data.map((d) => d.value))), [data]);
  const total = data.reduce((s, d) => s + d.value, 0);

  const W = 600;
  const H = height;
  const pad = { top: 12, right: 8, bottom: 22, left: 8 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;
  const slot = data.length ? innerW / data.length : innerW;
  const barW = Math.max(2, Math.min(28, slot - 2));
  const ticks = [0, 0.5, 1];
  const labelEvery = Math.ceil(data.length / 8);

  const bar = (d: BarDatum, i: number) => {
    const h = max ? (d.value / max) * innerH : 0;
    const x = pad.left + i * slot + (slot - barW) / 2;
    const y = pad.top + innerH - h;
    const r = Math.min(4, barW / 2, h);
    // retângulo com só os cantos de cima arredondados, apoiado na base
    const path =
      h <= 0
        ? ''
        : `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`;
    return { x, y, h, path };
  };

  const hovered = hover != null ? data[hover] : null;

  return (
    <figure className="chart card">
      <figcaption className="row">
        <span>
          <strong>{title}</strong>
          <span className="muted small"> · total {format(total)}</span>
        </span>
        <button className="btn small" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </figcaption>

      {asTable ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Dia</th>
                <th className="num">{title}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.key}>
                  <td>{d.label}</td>
                  <td className="num">{format(d.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-plot" onMouseLeave={() => setHover(null)}>
          <svg style={{ height: H }} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: total ${format(total)}`} preserveAspectRatio="none">
            {ticks.map((t) => {
              const y = pad.top + innerH - t * innerH;
              return <line key={t} x1={pad.left} x2={W - pad.right} y1={y} y2={y} className={t === 0 ? 'axis' : 'grid'} />;
            })}
            {data.map((d, i) => {
              const b = bar(d, i);
              return (
                <g key={d.key}>
                  {b.path && <path d={b.path} className={`bar ${hover === i ? 'on' : ''}`} />}
                  {/* área de toque maior que a barra */}
                  <rect
                    x={pad.left + i * slot}
                    y={pad.top}
                    width={slot}
                    height={innerH}
                    fill="transparent"
                    onMouseEnter={() => setHover(i)}
                    onClick={() => setHover(hover === i ? null : i)}
                  />
                </g>
              );
            })}
          </svg>
          {/* rótulos do eixo: o SVG tem altura fixa igual ao viewBox, então 1 unidade = 1px na vertical */}
          <span className="chart-y" style={{ top: pad.top - 14 }}>
            {format(max)}
          </span>
          <span className="chart-y" style={{ top: pad.top + innerH / 2 - 14 }}>
            {format(max / 2)}
          </span>
          <div className="chart-x" aria-hidden="true">
            {data.map((d, i) => (
              <span key={d.key} style={{ visibility: i % labelEvery === 0 ? 'visible' : 'hidden' }}>
                {d.label}
              </span>
            ))}
          </div>
          {hovered && (
            <div
              className="chart-tip"
              style={(() => {
                // perto das bordas, o balão se alinha para dentro do gráfico
                const pos = (pad.left + (hover! + 0.5) * slot) / W;
                const shift = pos > 0.8 ? -90 : pos < 0.2 ? -10 : -50;
                return { left: `${pos * 100}%`, transform: `translateX(${shift}%)` };
              })()}
              role="status"
            >
              <span className="muted small">{hovered.label}</span>
              <strong>{format(hovered.value)}</strong>
            </div>
          )}
        </div>
      )}
    </figure>
  );
}
