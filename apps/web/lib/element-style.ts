import { FabricImage, FabricObject, Group, Path, Pattern, Polygon, Rect, Triangle } from "fabric";

import { dilateAlpha } from "./cutout";

export type StyledObject = FabricObject & { assetType?: string; cutout?: boolean; outlineWidth?: number; outlineColor?: string; cornerRadius?: number; cornerPoints?: { x: number; y: number }[] };
export const isImageFrame = (object: FabricObject) => (object as StyledObject).assetType === "image-frame";
export const canRound = (object: FabricObject) => object instanceof Rect || object instanceof FabricImage || object instanceof Triangle || object instanceof Polygon || isImageFrame(object) || !!(object as StyledObject).cornerPoints;
export function borderObject(object: FabricObject): {strokeWidth: number; stroke: FabricObject["stroke"]} {
  if (isImageFrame(object) && object instanceof Group) {
    const value = object as StyledObject;
    const border = object.getObjects()[1];
    return {strokeWidth: value.outlineWidth ?? border.strokeWidth, stroke: value.outlineColor ?? border.stroke};
  }
  return object;
}
export function roundElement(object: FabricObject, radius: number): FabricObject {
  if (object instanceof Rect) { object.set({ rx: radius, ry: radius }); return object; }
  if (object instanceof FabricImage) {
    const options = object.toObject();
    const center = object.getCenterPoint();
    const width = object.width, height = object.height;
    object.set({ left: 0, top: 0, originX: "left", originY: "top", scaleX: 1, scaleY: 1, angle: 0, skewX: 0, skewY: 0, flipX: false, flipY: false, opacity: 1, strokeWidth: 0 });
    const frame = new Rect({ width, height, fill: "transparent", stroke: options.stroke || "#252821", strokeWidth: 0 });
    const group = new Group([object, frame], {
      scaleX: options.scaleX, scaleY: options.scaleY, angle: options.angle, skewX: options.skewX, skewY: options.skewY,
      flipX: options.flipX, flipY: options.flipY, opacity: options.opacity,
    }) as StyledObject & Group;
    Object.assign(group, { id: options.id, name: options.name, assetType: "image-frame" });
    group.setPositionByOrigin(center, "center", "center");
    styleImageFrame(group, radius, options.strokeWidth || 0, options.stroke || "#252821");
    return group;
  }
  if (isImageFrame(object) && object instanceof Group) {
    const border = borderObject(object);
    styleImageFrame(object, radius, border.strokeWidth, border.stroke);
    return object;
  }
  const styled = object as StyledObject;
  const points = styled.cornerPoints ?? (object instanceof Polygon ? object.points : object instanceof Triangle ? [{x: 0,y: object.height},{x: object.width/2,y: 0},{x: object.width,y: object.height}] : undefined);
  if (!points) return object;
  const corners = points.map((p, i) => {
    const previous = points[(i + points.length - 1) % points.length], next = points[(i + 1) % points.length];
    const a = Math.hypot(previous.x-p.x,previous.y-p.y), b = Math.hypot(next.x-p.x,next.y-p.y);
    const distance = Math.min(radius, a/2, b/2);
    return {p, start: {x:p.x+(previous.x-p.x)*distance/(a||1),y:p.y+(previous.y-p.y)*distance/(a||1)}, end:{x:p.x+(next.x-p.x)*distance/(b||1),y:p.y+(next.y-p.y)*distance/(b||1)}};
  });
  const path = corners.map((c,i) => `${i ? "L" : "M"} ${c.start.x} ${c.start.y} Q ${c.p.x} ${c.p.y} ${c.end.x} ${c.end.y}`).join(" ")+" Z";
  const options = object.toObject();
  delete options.type; delete options.path; delete options.points;
  const result = new Path(path, options) as StyledObject;
  result.cornerPoints = points; result.cornerRadius = radius;
  result.setPositionByOrigin(object.getCenterPoint(), "center", "center");
  return result;
}

export function styleImageFrame(group: Group, radius: number, width: number, color: FabricObject["stroke"]) {
  const [image, border] = group.getObjects();
  const styled = group as StyledObject;
  styled.outlineWidth = width; styled.outlineColor = typeof color === "string" ? color : "#252821";
  if (styled.cutout && image instanceof FabricImage) {
    drawOutline(group, image, width, styled.outlineColor);
    return;
  }
  const r = Math.min(radius, image.width/2, image.height/2);
  const w = Math.min(width, image.width, image.height);
  image.clipPath = new Rect({ width: image.width, height: image.height, rx: r, ry: r, originX: "center", originY: "center", strokeWidth: 0 });
  image.dirty = true;
  // Fabric includes the stroke in origin positioning; anchor both objects by center.
  const center = image.getRelativeCenterPoint();
  border.set({ width: image.width-w, height: image.height-w, originX: "center", originY: "center", left: center.x, top: center.y, rx: Math.max(0,r-w/2), ry: Math.max(0,r-w/2), stroke: color, strokeWidth: w, fill: "transparent" });
  border.setCoords();
  (group as StyledObject).cornerRadius = radius;
  group.dirty = true;
}

function drawOutline(group: Group, image: FabricImage, width: number, color: string) {
  image.clipPath = undefined;
  const ratio = Math.min(1, 1024 / Math.max(image.width,image.height));
  const w = Math.max(1,Math.round(image.width*ratio)), h=Math.max(1,Math.round(image.height*ratio));
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(image.getElement(),0,0,w,h);
  const pixels=ctx.getImageData(0,0,w,h), alpha=new Uint8ClampedArray(w*h);
  for(let i=0;i<alpha.length;i++)alpha[i]=pixels.data[i*4+3];
  const expanded=dilateAlpha(alpha,w,h,Math.ceil(width*ratio));
  ctx.clearRect(0,0,w,h);ctx.fillStyle=color;ctx.fillRect(0,0,w,h);
  const ring=ctx.getImageData(0,0,w,h);
  for(let i=0;i<alpha.length;i++)ring.data[i*4+3]=width>0?Math.max(0,expanded[i]-alpha[i]):0;
  ctx.putImageData(ring,0,0);
  const center=image.getRelativeCenterPoint();
  const border=group.getObjects()[1];
  border.set({width:image.width,height:image.height,rx:0,ry:0,originX:'center',originY:'center',left:center.x,top:center.y,scaleX:1,scaleY:1,strokeWidth:0,stroke:null,fill:new Pattern({source:canvas,repeat:'no-repeat',patternTransform:[image.width/w,0,0,image.height/h,0,0]})});
  border.setCoords();image.dirty=true;group.dirty=true;
}
