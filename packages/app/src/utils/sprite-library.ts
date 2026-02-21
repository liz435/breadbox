export interface SpriteTemplate {
  name: string;
  draw: (ctx: CanvasRenderingContext2D, size: number) => void;
}

function makeImage(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void): Promise<HTMLImageElement> {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, size);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.src = canvas.toDataURL();
  });
}

const templates: SpriteTemplate[] = [
  {
    name: "Square",
    draw(ctx, s) {
      ctx.fillStyle = "#4a9eff";
      ctx.fillRect(s * 0.1, s * 0.1, s * 0.8, s * 0.8);
    },
  },
  {
    name: "Circle",
    draw(ctx, s) {
      ctx.fillStyle = "#ff6b6b";
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.4, 0, Math.PI * 2);
      ctx.fill();
    },
  },
  {
    name: "Triangle",
    draw(ctx, s) {
      ctx.fillStyle = "#51cf66";
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.1);
      ctx.lineTo(s * 0.9, s * 0.9);
      ctx.lineTo(s * 0.1, s * 0.9);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "Star",
    draw(ctx, s) {
      ctx.fillStyle = "#fcc419";
      ctx.beginPath();
      const cx = s / 2, cy = s / 2, spikes = 5, outerR = s * 0.4, innerR = s * 0.18;
      for (let i = 0; i < spikes * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI / spikes) * i - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "Diamond",
    draw(ctx, s) {
      ctx.fillStyle = "#cc5de8";
      ctx.beginPath();
      ctx.moveTo(s / 2, s * 0.1);
      ctx.lineTo(s * 0.9, s / 2);
      ctx.lineTo(s / 2, s * 0.9);
      ctx.lineTo(s * 0.1, s / 2);
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "Hex",
    draw(ctx, s) {
      ctx.fillStyle = "#20c997";
      ctx.beginPath();
      const cx = s / 2, cy = s / 2, r = s * 0.4;
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
    },
  },
  {
    name: "Ring",
    draw(ctx, s) {
      ctx.strokeStyle = "#ff922b";
      ctx.lineWidth = s * 0.08;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.35, 0, Math.PI * 2);
      ctx.stroke();
    },
  },
  {
    name: "Cross",
    draw(ctx, s) {
      ctx.fillStyle = "#f06595";
      const t = s * 0.25;
      ctx.fillRect(s / 2 - t / 2, s * 0.1, t, s * 0.8);
      ctx.fillRect(s * 0.1, s / 2 - t / 2, s * 0.8, t);
    },
  },
];

const SPRITE_SIZE = 512;

export function getTemplateImage(template: SpriteTemplate): Promise<HTMLImageElement> {
  return makeImage(SPRITE_SIZE, template.draw);
}

export function getTemplateThumbnail(template: SpriteTemplate): string {
  const canvas = document.createElement("canvas");
  const thumbSize = 48;
  canvas.width = thumbSize;
  canvas.height = thumbSize;
  const ctx = canvas.getContext("2d")!;
  template.draw(ctx, thumbSize);
  return canvas.toDataURL();
}

export { templates };
