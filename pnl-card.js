import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Register Fonts
registerFont(path.join(__dirname, 'assets', 'Rajdhani-Bold.ttf'), { family: 'Rajdhani', weight: 'bold' });
registerFont(path.join(__dirname, 'assets', 'Barlow-Regular.ttf'), { family: 'Barlow' });
registerFont(path.join(__dirname, 'assets', 'ShareTechMono-Regular.ttf'), { family: 'Share Tech Mono' });

export async function generatePnLImage({
  pair,
  pnlDisplay,
  pctDisplay,
  isWin,
  isLoss,
  absPct,
  feesDisplay,
  durationStr,
  strategy,
  binStep,
  reason
}) {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background
  const bgName = isWin ? 'bg_green.png' : 'bg_red.png';
  const bgPath = path.join(__dirname, 'assets', bgName);
  const bg = await loadImage(bgPath);
  
  // Draw bg filling the canvas to avoid empty transparent areas
  ctx.drawImage(bg, 0, -100, 1200, 1200);

  // Left translucent panel for high readability
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)'; // slate-900 with 85% opacity
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(650, 0);
  // diagonal slice
  ctx.lineTo(550, height);
  ctx.lineTo(0, height);
  ctx.fill();

  // Shadow on the edge
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 5;
  ctx.beginPath();
  ctx.moveTo(650, 0);
  ctx.lineTo(550, height);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;

  // Header
  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 36px Rajdhani';
  ctx.fillText('⚡ GODS GRACE', 40, 60);
  
  // Pair
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 54px Rajdhani';
  ctx.fillText(pair || 'UNKNOWN', 40, 140);

  // PnL %
  ctx.font = 'bold 140px Rajdhani';
  if (isWin) {
    ctx.fillStyle = '#39ff14'; // Bright neon green
    ctx.shadowColor = '#39ff14';
  } else if (isLoss) {
    ctx.fillStyle = '#ff2a2a'; // Bright neon red
    ctx.shadowColor = '#ff2a2a';
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.shadowColor = '#94a3b8';
  }
  ctx.shadowBlur = 25;
  ctx.fillText(pctDisplay, 40, 260);
  ctx.shadowBlur = 0;

  // Sub PnL (Amount)
  ctx.font = 'bold 44px Rajdhani';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(pnlDisplay, 40, 320);

  // Stats Grid on the left
  function drawStat(x, y, label, value, maxWidth) {
    // Label
    ctx.fillStyle = 'rgba(226, 232, 240, 0.6)'; // slate-200 with 60% opacity
    ctx.font = '18px Barlow';
    const spacedLabel = label.split('').join(' '); // tracking
    ctx.fillText(spacedLabel, x, y);
    
    // Value
    ctx.fillStyle = '#f8fafc';
    let valText = value || '-';
    ctx.font = '26px "Share Tech Mono"';
    if (ctx.measureText(valText).width > maxWidth) {
      ctx.font = '22px "Share Tech Mono"';
      if (ctx.measureText(valText).width > maxWidth) {
        valText = valText.substring(0, 18) + '...';
      }
    }
    ctx.fillText(valText, x, y + 32);
  }

  drawStat(40, 420, 'STRATEGY', strategy?.toUpperCase(), 260);
  drawStat(320, 420, 'DURATION', durationStr?.toUpperCase(), 200);
  drawStat(40, 500, 'FEES EARNED', feesDisplay || '0', 260);
  drawStat(320, 500, 'EXIT REASON', reason ? reason : 'Closed', 200);

  // Bottom watermark
  ctx.fillStyle = '#64748b';
  ctx.font = '22px "Share Tech Mono"';
  ctx.fillText('godsgrace.trade', 40, 600);
  
  ctx.textAlign = 'right';
  const date = new Date();
  const dateStr = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date) + ' • ' + date.toISOString().substring(11, 16) + ' UTC';
  
  ctx.font = '18px "Share Tech Mono"';
  const textWidth = ctx.measureText(dateStr).width;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(1160 - textWidth - 15, 578, textWidth + 30, 32, 8);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(dateStr, 1160, 600);

  return canvas.toBuffer('image/png');
}

export async function generateDailyPnLImage({
  agentName,
  dateStr,
  totalPnlDisplay,
  winRateDisplay,
  isWin,
  isLoss,
  tradesDisplay,
  customLabel1,
  customValue1,
  customLabel2,
  customValue2
}) {
  const width = 1200;
  const height = 630;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const bgName = isWin ? 'bg_green.png' : 'bg_red.png';
  const bgPath = path.join(__dirname, 'assets', bgName);
  const bg = await loadImage(bgPath);
  
  ctx.drawImage(bg, 0, -100, 1200, 1200);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(650, 0);
  ctx.lineTo(550, height);
  ctx.lineTo(0, height);
  ctx.fill();

  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 15;
  ctx.shadowOffsetX = 5;
  ctx.beginPath();
  ctx.moveTo(650, 0);
  ctx.lineTo(550, height);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;

  ctx.fillStyle = '#f97316';
  ctx.font = 'bold 36px Rajdhani';
  ctx.fillText('⚡ ' + agentName, 40, 60);
  
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 54px Rajdhani';
  ctx.fillText('DAILY SUMMARY', 40, 140);

  ctx.font = 'bold 120px Rajdhani';
  if (isWin) {
    ctx.fillStyle = '#39ff14';
    ctx.shadowColor = '#39ff14';
  } else if (isLoss) {
    ctx.fillStyle = '#ff2a2a';
    ctx.shadowColor = '#ff2a2a';
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.shadowColor = '#94a3b8';
  }
  ctx.shadowBlur = 25;
  ctx.fillText(totalPnlDisplay, 40, 260);
  ctx.shadowBlur = 0;

  ctx.font = 'bold 44px Rajdhani';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(winRateDisplay, 40, 320);

  function drawStat(x, y, label, value, maxWidth) {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.6)';
    ctx.font = '18px Barlow';
    const spacedLabel = label.split('').join(' ');
    ctx.fillText(spacedLabel, x, y);
    
    ctx.fillStyle = '#f8fafc';
    let valText = value || '-';
    ctx.font = '26px "Share Tech Mono"';
    if (ctx.measureText(valText).width > maxWidth) {
      ctx.font = '22px "Share Tech Mono"';
      if (ctx.measureText(valText).width > maxWidth) {
        valText = valText.substring(0, 18) + '...';
      }
    }
    ctx.fillText(valText, x, y + 32);
  }

  drawStat(40, 420, 'CLOSED TRADES', tradesDisplay, 260);
  drawStat(320, 420, 'DATE', dateStr, 200);
  drawStat(40, 500, customLabel1, customValue1, 260);
  drawStat(320, 500, customLabel2, customValue2, 200);

  ctx.fillStyle = '#64748b';
  ctx.font = '22px "Share Tech Mono"';
  const domain = agentName === 'GODS GRACE' ? 'godsgrace.trade' : 'charon.trade';
  ctx.fillText(domain, 40, 600);
  
  ctx.textAlign = 'right';
  const now = new Date();
  const footerDate = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(now) + ' • ' + now.toISOString().substring(11, 16) + ' UTC';
  
  ctx.font = '18px "Share Tech Mono"';
  const textWidth = ctx.measureText(footerDate).width;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
  ctx.beginPath();
  ctx.roundRect(1160 - textWidth - 15, 578, textWidth + 30, 32, 8);
  ctx.fill();

  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(footerDate, 1160, 600);

  return canvas.toBuffer('image/png');
}
