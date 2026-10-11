import {cropBounds} from './core.js';

/** Locally decoded pixels only. Never fetch a website's image from this panel. */
export async function imageReference(blob, name='reference', rect=null, viewport=null) {
  if (!(blob instanceof Blob) || blob.size > 12_000_000) throw new Error('Choose an image smaller than 12 MB.');
  const bitmap = await createImageBitmap(blob);
  try {
    if (bitmap.width * bitmap.height > 32_000_000) throw new Error('Choose an image below 32 megapixels.');
    const crop = rect ? cropBounds(rect, viewport, bitmap) : {x:0,y:0,width:bitmap.width,height:bitmap.height};
    const scale = Math.min(1, 2560/Math.max(crop.width,crop.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1,Math.round(crop.width*scale)); canvas.height = Math.max(1,Math.round(crop.height*scale));
    const ctx=canvas.getContext('2d');
    ctx.drawImage(bitmap,crop.x,crop.y,crop.width,crop.height,0,0,canvas.width,canvas.height);
    const tiny=document.createElement('canvas');tiny.width=96;tiny.height=Math.max(1,Math.round(96*canvas.height/canvas.width));
    tiny.height=Math.min(192,tiny.height);
    const tc=tiny.getContext('2d',{willReadFrequently:true});tc.drawImage(canvas,0,0,tiny.width,tiny.height);
    const pixels=tc.getImageData(0,0,tiny.width,tiny.height).data,bins=new Map();let total=0;
    for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]<220)continue;total++;
      const rgb=[pixels[i],pixels[i+1],pixels[i+2]],key=rgb.map(v=>Math.round(v/24)).join(',');
      const b=bins.get(key)||{sum:[0,0,0],count:0};b.count++;rgb.forEach((v,j)=>b.sum[j]+=v);bins.set(key,b);
    }
    const colors=[...bins.values()].sort((a,b)=>b.count-a.count).slice(0,10).map(b=>({value:'#'+b.sum.map(v=>Math.round(v/b.count).toString(16).padStart(2,'0')).join('').toUpperCase(),share:Math.round(b.count/Math.max(1,total)*100)}));
    return {name,width:canvas.width,height:canvas.height,originalWidth:crop.width,originalHeight:crop.height,dataURL:canvas.toDataURL('image/png'),colors,note:'Sampled and quantized image colors; not original design tokens. Fonts and layout require visual reconstruction.'};
  } finally {bitmap.close();}
}
export function dataURLBlob(url) {
  if(!/^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(url))throw new Error('Invalid PNG image data.');
  const binary=atob(url.split(',')[1]),bytes=new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return new Blob([bytes],{type:'image/png'});
}
