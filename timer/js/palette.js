export const PALETTES = {
  shell:   { bg0:'#0a0a1a', bg1:'#140a26', cyan:'#00e5ff', magenta:'#ff2db4', yellow:'#ffde00', ink:'#e9e9ff' },
  castle:  { sky0:'#2b0c3d', sky1:'#ff5e94', sun0:'#ffdd66', sun1:'#ff2e88', grid:'#7a1e5a',
             stone:'#483668', accent:'#00f5d4', flag:'#ffd166', ground:'#1c082a' },
  monster: { sky0:'#1a0b2e', sky1:'#00aac8', accent:'#ffde00', hpfull:'#39ff14', hplow:'#ff2db4',
             hero:'#00e5ff', beast:'#c77dff', ground:'#140828' },
};
export function hexToRgb(h){ h=h.replace('#',''); return [0,2,4].map(i=>parseInt(h.substr(i,2),16)); }
export function lerpHex(a,b,t){
  const A=hexToRgb(a), B=hexToRgb(b);
  const c=A.map((v,i)=>Math.round(v+(B[i]-v)*t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
