export type KeySettings = { color: string; tolerance: number; softness: number; spill: number };
export function keyPixels(data: Uint8ClampedArray, settings: KeySettings) {
  const key = [1,3,5].map(i => parseInt(settings.color.slice(i,i+2),16));
  const dominant = key.indexOf(Math.max(...key));
  for (let i=0;i<data.length;i+=4) {
    const distance = Math.hypot(data[i]-key[0],data[i+1]-key[1],data[i+2]-key[2]);
    const alpha = Math.max(0,Math.min(1,(distance-settings.tolerance)/Math.max(1,settings.softness)));
    data[i+3] *= alpha;
    if (alpha > 0 && alpha < 1 && settings.spill) {
      const neutral = (data[i+(dominant+1)%3]+data[i+(dominant+2)%3])/2;
      data[i+dominant] -= Math.max(0,data[i+dominant]-neutral)*(1-alpha)*settings.spill/100;
    }
  }
}
export async function editAlpha(src: string, settings: KeySettings | number): Promise<string> {
  const image = new Image(); image.src=src; await image.decode();
  if(image.naturalWidth*image.naturalHeight>16_000_000) throw new Error("Use an image under 16 megapixels.");
  const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;
  const ctx=canvas.getContext('2d')!;ctx.drawImage(image,0,0);
  const pixels=ctx.getImageData(0,0,canvas.width,canvas.height);
  if(typeof settings === 'number') {
    const solidAt = Math.max(.05,1-settings/100*.9)*255;
    for(let i=3;i<pixels.data.length;i+=4) pixels.data[i]=Math.min(255,pixels.data[i]*255/solidAt);
  } else keyPixels(pixels.data,settings);
  ctx.putImageData(pixels,0,0);return canvas.toDataURL('image/png');
}

/** Separable square dilation, linear in pixel count even for wide outlines. */
export function dilateAlpha(input: Uint8ClampedArray, width: number, height: number, radius: number) {
  let source = input;
  for (const horizontal of [true,false]) {
    const result = new Uint8ClampedArray(width*height);
    const length=horizontal?width:height, lines=horizontal?height:width;
    for(let line=0;line<lines;line++) {
      const queue:number[]=[];let head=0, next=0;
      const index=(p:number)=>horizontal?line*width+p:p*width+line;
      for(let p=0;p<length;p++) {
        while(next<length && next<=p+radius) {
          while(queue.length>head && source[index(queue[queue.length-1])]<=source[index(next)]) queue.pop();
          queue.push(next++);
        }
        while(queue[head]<p-radius) head++;
        result[index(p)]=source[index(queue[head])];
      }
    }
    source=result;
  }
  return source;
}
