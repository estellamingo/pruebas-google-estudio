const DaedalusExporter=(()=>{
const SOCIAL_HEIGHT=1350;
const SOCIAL_BLUE="#1E3781";

function setStatus(text,isError=false){
  const el=document.getElementById("startupStatus");
  if(!el)return;
  el.textContent=text;
  el.classList.toggle("error",isError);
  el.classList.toggle("ready",!isError);
}

function isMobile(){
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent||"") ||
    (Number(navigator.maxTouchPoints||0)>1 && window.innerWidth<=1100);
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const link=document.createElement("a");
  link.href=url;
  link.download=filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2500);
}

function canvasToBlob(canvas){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(
      blob=>blob?resolve(blob):reject(new Error("No se pudo crear el archivo PNG.")),
      "image/png"
    );
  });
}

async function svgElementToImage(svgElement){
  const clone=svgElement.cloneNode(true);
  clone.setAttribute("xmlns","http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink","http://www.w3.org/1999/xlink");
  const source=new XMLSerializer().serializeToString(clone);
  const blob=new Blob([source],{type:"image/svg+xml;charset=utf-8"});
  const url=URL.createObjectURL(blob);

  try{
    return await new Promise((resolve,reject)=>{
      const image=new Image();
      image.onload=()=>resolve(image);
      image.onerror=()=>reject(new Error("No se pudo rasterizar la plantilla SVG."));
      image.src=url;
    });
  }finally{
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
}

function cssNumber(value,fallback=0){
  const parsed=parseFloat(value);
  return Number.isFinite(parsed)?parsed:fallback;
}

function drawBackgroundLayers(ctx,width,height){
  ctx.fillStyle="#ffffff";
  ctx.fillRect(0,0,width,height);

  const extension=document.getElementById("extensionLayer");
  if(extension){
    const style=getComputedStyle(extension);
    const top=cssNumber(style.top);
    const h=cssNumber(style.height);
    if(h>0){
      ctx.fillStyle=style.backgroundColor||"#ffffff";
      ctx.fillRect(0,top,width,h);
    }
  }
}

function drawContinuousSidebar(ctx){
  const bar=document.getElementById("barExtension");
  if(!bar || getComputedStyle(bar).display==="none")return;

  const style=getComputedStyle(bar);
  const x=cssNumber(style.left);
  const y=cssNumber(style.top);
  const w=cssNumber(style.width);
  const h=cssNumber(style.height);
  const radius=cssNumber(style.borderRadius);

  const gradient=ctx.createLinearGradient(0,y,0,y+h);
  gradient.addColorStop(0,"#0a0045");
  gradient.addColorStop(.20,"#2264cd");
  gradient.addColorStop(.50,"#5a80ff");
  gradient.addColorStop(.80,"#8fd1e7");
  gradient.addColorStop(1,"#8fd1e7");

  ctx.save();
  ctx.fillStyle=gradient;
  ctx.beginPath();
  if(ctx.roundRect){
    ctx.roundRect(x,y,w,h,radius);
  }else{
    ctx.rect(x,y,w,h);
  }
  ctx.fill();
  ctx.restore();
}

function textNodes(root){
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{
    acceptNode(node){
      return node.nodeValue && node.nodeValue.trim()
        ? NodeFilter.FILTER_ACCEPT
        : NodeFilter.FILTER_REJECT;
    }
  });
  const nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  return nodes;
}

function wordRanges(node){
  const text=node.nodeValue||"";
  const regex=/\S+/g;
  const ranges=[];
  let match;
  while((match=regex.exec(text))){
    const range=document.createRange();
    range.setStart(node,match.index);
    range.setEnd(node,match.index+match[0].length);
    ranges.push({range,text:match[0]});
  }
  return ranges;
}

function drawDomText(ctx,artboard){
  const artRect=artboard.getBoundingClientRect();
  const layer=document.getElementById("textLayer");
  if(!layer)return;

  // En móvil el artboard se muestra escalado con CSS. getClientRects() devuelve
  // coordenadas visuales escaladas; normalizamos de vuelta al sistema 1080 px.
  const naturalWidth=artboard.offsetWidth||1080;
  const naturalHeight=artboard.offsetHeight||cssNumber(getComputedStyle(artboard).height,artboard.scrollHeight);
  const scaleX=(artRect.width/naturalWidth)||1;
  const scaleY=(artRect.height/naturalHeight)||scaleX||1;

  ctx.save();
  ctx.textBaseline="alphabetic";

  for(const node of textNodes(layer)){
    const parent=node.parentElement;
    if(!parent)continue;
    const style=getComputedStyle(parent);
    if(style.display==="none" || style.visibility==="hidden" || parseFloat(style.opacity)===0)continue;

    const fontSize=cssNumber(style.fontSize,16);
    const lineHeight=cssNumber(style.lineHeight,fontSize*1.2);
    const family=style.fontFamily||"Arial";
    const weight=style.fontWeight||"400";
    const fontStyle=style.fontStyle||"normal";
    ctx.font=`${fontStyle} ${weight} ${fontSize}px ${family}`;
    ctx.fillStyle=style.color||"#222";
    ctx.globalAlpha=cssNumber(style.opacity,1);

    for(const item of wordRanges(node)){
      const rects=[...item.range.getClientRects()];
      for(const rect of rects){
        if(rect.width<=0 || rect.height<=0)continue;
        const x=(rect.left-artRect.left)/scaleX;
        const top=(rect.top-artRect.top)/scaleY;
        const baseline=top+(lineHeight-fontSize)/2+fontSize*.82;
        ctx.fillText(item.text,x,baseline);
      }
    }
  }

  ctx.restore();
}

async function renderOriginalCanvas(template){
  await document.fonts.ready;
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));

  const artboard=document.getElementById("artboard");
  const templateSvg=document.querySelector("#templateLayer svg");
  if(!artboard || !templateSvg)throw new Error("No se encontró la composición del comunicado.");

  const width=Math.round(template.width||1080);
  const height=Math.ceil(cssNumber(getComputedStyle(artboard).height,artboard.scrollHeight));

  const canvas=document.createElement("canvas");
  canvas.width=width;
  canvas.height=height;
  const ctx=canvas.getContext("2d");

  drawBackgroundLayers(ctx,width,height);

  const templateImage=await svgElementToImage(templateSvg);
  const svgHeight=cssNumber(
    templateSvg.getAttribute("height"),
    templateSvg.viewBox?.baseVal?.height||357.52
  );

  ctx.drawImage(templateImage,0,0,width,svgHeight);

  // Redibuja la barra completa sobre la barra incluida en el SVG.
  // Así se evita la unión visible entre el tramo fijo y la extensión dinámica.
  drawContinuousSidebar(ctx);

  drawDomText(ctx,artboard);

  return canvas;
}

function createSocialCanvas(originalCanvas){
  if(originalCanvas.height>=SOCIAL_HEIGHT)return null;

  const social=document.createElement("canvas");
  social.width=1080;
  social.height=SOCIAL_HEIGHT;
  const ctx=social.getContext("2d");

  ctx.fillStyle=SOCIAL_BLUE;
  ctx.fillRect(0,0,social.width,social.height);

  const y=Math.round((SOCIAL_HEIGHT-originalCanvas.height)/2);
  ctx.drawImage(originalCanvas,0,y);

  return social;
}

async function buildExportFiles(template){
  const originalCanvas=await renderOriginalCanvas(template);
  const originalBlob=await canvasToBlob(originalCanvas);
  const date=new Date().toISOString().slice(0,10);

  const files=[
    new File(
      [originalBlob],
      `comunicado_original_${date}.png`,
      {type:"image/png"}
    )
  ];

  const socialCanvas=createSocialCanvas(originalCanvas);
  if(socialCanvas){
    const socialBlob=await canvasToBlob(socialCanvas);
    files.push(
      new File(
        [socialBlob],
        `comunicado_4x5_${date}.png`,
        {type:"image/png"}
      )
    );
  }

  return {
    files,
    originalHeight:originalCanvas.height,
    hasSocial:Boolean(socialCanvas)
  };
}

async function downloadDesktop(files){
  if(files.length===1){
    downloadBlob(files[0],files[0].name);
    return "Se descargó el comunicado original.";
  }

  if(typeof JSZip==="undefined"){
    for(const file of files){
      downloadBlob(file,file.name);
      await new Promise(resolve=>setTimeout(resolve,350));
    }
    return "Se descargaron las dos imágenes por separado.";
  }

  const zip=new JSZip();
  for(const file of files)zip.file(file.name,file);
  const blob=await zip.generateAsync({type:"blob"});
  downloadBlob(blob,`comunicado_original_y_4x5_${new Date().toISOString().slice(0,10)}.zip`);
  return "Se descargó un ZIP con el original y la adaptación 4:5.";
}

async function shareOrDownload(files){
  const canShare=isMobile() &&
    typeof navigator.share==="function" &&
    typeof navigator.canShare==="function" &&
    navigator.canShare({files});

  if(canShare){
    await navigator.share({
      files,
      title:files.length===2
        ?"Comunicado original y adaptación 4:5"
        :"Comunicado"
    });
    return files.length===2
      ?"Las dos imágenes están listas para guardar o compartir."
      :"La imagen está lista para guardar o compartir.";
  }

  return downloadDesktop(files);
}

async function exportPNG(template,button){
  const oldText=button?.textContent||"Exportar PNG";
  if(button){
    button.disabled=true;
    button.textContent="Generando…";
  }
  setStatus("Generando comunicado…");

  try{
    const result=await buildExportFiles(template);

    if(result.hasSocial){
      setStatus(`Generando original (${result.originalHeight}px) y adaptación 4:5…`);
    }else if(result.originalHeight===SOCIAL_HEIGHT){
      setStatus("El original ya mide 1080 × 1350. No necesita adaptación.");
    }else{
      setStatus(`El original mide ${result.originalHeight}px de alto. Se exportará sin adaptación 4:5.`);
    }

    const message=await shareOrDownload(result.files);
    setStatus(message);
  }catch(error){
    console.error("Error al exportar comunicado:",error);
    setStatus(`No se pudo generar la imagen: ${error.message||error}`,true);
    alert(`No se pudo generar la imagen.\n${error.message||error}`);
  }finally{
    if(button){
      button.disabled=false;
      button.textContent=oldText;
    }
  }
}

return{exportPNG};
})();