(()=>{
const editor=document.getElementById("editor");
const dateInput=document.getElementById("dateInput");
const dateRender=document.getElementById("dateRender");
const contentRender=document.getElementById("contentRender");
const artboard=document.getElementById("artboard");
const footer=document.getElementById("footer");
const previewShell=document.getElementById("previewShell");
const previewViewport=document.getElementById("previewViewport");
const status=document.getElementById("status");
const exportBtn=document.getElementById("exportBtn");

// Constantes métricas fijas del documento
const HEADER_BOTTOM=210;
const CONTENT_TOP=230;

const FOOTER_SOURCE_Y = 600;
const FOOTER_SOURCE_HEIGHT = 160;

const RIBBON_SOURCE_TOP = 610.11;
const RIBBON_SOURCE_BOTTOM = 740.38;
const RIBBON_HEIGHT = RIBBON_SOURCE_BOTTOM - RIBBON_SOURCE_TOP;

const RIBBON_OFFSET_TOP = RIBBON_SOURCE_TOP - FOOTER_SOURCE_Y;

const TEXT_TO_RIBBON_GAP=20; // 20px desde la última línea hasta el inicio del lazo
const BOTTOM_MARGIN=30; // 30px desde el final del lazo hasta el fin del documento
const BLOCK_GAP=32; // Separación vertical entre bloques/párrafos independientes
const MAX_CONTENT_WIDTH=980; // Ancho útil (1080 - 50*2 de margen lateral)

const SOCIAL_HEIGHT=1350;
const SOCIAL_BLUE="#1E3781";

const EXAMPLE=`<div data-block="1"><span class="regular">La Fiscalía General del Estado expresa sus más sinceras condolencias y sentimientos de pesar al presidente de la República, </span><span class="bold">Daniel Noboa Azín</span><span class="regular">, y a la primera dama, </span><span class="bold">Lavinia Valbonesi</span><span class="regular">, así como a sus familiares, amigos y allegados, ante la irreparable pérdida de:</span></div><div data-block="1"><span class="black">Stefano Noboa Valbonesi</span></div><div data-block="1"><span class="regular">Que la fuerza y la resignación los acompañen en estos duros momentos.</span></div>`;

function escapeHtml(str){
  return str.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

function isMobile(){
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent||"") ||
    (Number(navigator.maxTouchPoints||0)>1 && window.innerWidth<=1100);
}

function seedEditor(){
  editor.innerHTML=EXAMPLE;
}

function normalizeEditor(){
  const walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT);
  const textNodes=[];
  while(walker.nextNode())textNodes.push(walker.currentNode);
  for(const node of textNodes){
    if(!node.parentElement.closest("[data-block]") && !node.parentElement.closest("div") && !node.parentElement.closest("p") && node.nodeValue.trim()){
      const block=document.createElement("div");
      block.dataset.block="1";
      const span=document.createElement("span");
      span.className="regular";
      node.parentNode.insertBefore(block,node);
      block.appendChild(span);
      span.appendChild(node);
    }
  }
}

function applyStyle(style){
  const sel=window.getSelection();
  if(!sel || !sel.rangeCount || sel.isCollapsed)return;
  const range=sel.getRangeAt(0);
  if(!editor.contains(range.commonAncestorContainer))return;

  const span=document.createElement("span");
  span.className=style;
  try{
    range.surroundContents(span);
  }catch{
    const frag=range.extractContents();
    span.appendChild(frag);
    range.insertNode(span);
  }

  // Limpiar spans anidados innecesarios
  const innerSpans=span.querySelectorAll("span");
  for(const inner of innerSpans){
    inner.className=style;
  }

  sel.removeAllRanges();
  const newRange=document.createRange();
  newRange.selectNodeContents(span);
  sel.addRange(newRange);
  render();
}

function blocksFromEditor(){
  const temp=document.createElement("div");
  temp.innerHTML=editor.innerHTML;

  function nearestStyle(el){
    while(el && el!==temp){
      if(el.classList?.contains("black"))return "black";
      if(el.classList?.contains("bold"))return "bold";
      if(el.classList?.contains("regular"))return "regular";
      el=el.parentElement;
    }
    return "regular";
  }

  const blocks=[];
  let currentBlock=[];

  function flushBlock(){
    if(currentBlock.length>0){
      const clean=currentBlock.filter(p=>p.text.length>0);
      if(clean.some(p=>p.text.trim().length>0)){
        blocks.push(clean);
      }
      currentBlock=[];
    }
  }

  function appendText(text, style){
    if(!text)return;
    const rawParagraphs=text.split(/\n\s*\n+/);
    for(let i=0;i<rawParagraphs.length;i++){
      if(i>0){
        flushBlock();
      }
      const paragraphText=rawParagraphs[i];
      if(paragraphText.length>0){
        currentBlock.push({text:paragraphText,style});
      }
    }
  }

  function walk(node){
    if(node.nodeType===Node.TEXT_NODE){
      appendText(node.nodeValue, nearestStyle(node.parentElement));
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE)return;

    const tag=node.tagName;

    if(tag==="BR"){
      if(node.nextElementSibling && node.nextElementSibling.tagName==="BR"){
        flushBlock();
      }else if(!node.previousElementSibling || node.previousElementSibling.tagName!=="BR"){
        currentBlock.push({text:"\n",style:nearestStyle(node.parentElement)});
      }
      return;
    }

    const isBlockTag=["DIV","P","LI","H1","H2","H3","H4","H5","H6","BLOCKQUOTE","SECTION"].includes(tag) || Boolean(node.dataset?.block);

    if(isBlockTag && currentBlock.length>0){
      flushBlock();
    }

    for(const child of node.childNodes){
      walk(child);
    }

    if(isBlockTag && currentBlock.length>0){
      flushBlock();
    }
  }

  for(const child of temp.childNodes){
    walk(child);
  }
  flushBlock();

  return blocks;
}

function textStyleSpec(style){
  if(style==="black")return {font:"900 40px 'Montserrat Condolencias Black', Montserrat, Arial",size:40,lineHeight:48};
  if(style==="bold")return {font:"700 24px Montserrat, Arial",size:24,lineHeight:34};
  return {font:"400 24px Montserrat, Arial",size:24,lineHeight:34};
}

// Canvas auxiliar para mediciones tipográficas del layout
let measureCtx=null;
function getMeasureContext(){
  if(!measureCtx){
    const c=document.createElement("canvas");
    measureCtx=c.getContext("2d");
  }
  return measureCtx;
}

/**
 * MOTOR DE LAYOUT UNIFICADO (Fuente de Verdad única para DOM y Canvas)
 * Retorna:
 * - blocks: array de bloques estructurados con sus líneas, tokens, posiciones y gaps
 * - lines: array plano de todas las líneas del documento con x, y, width, lineHeight
 * - contentBottom: límite inferior real del texto
 * - footerTop: posición Y exacta del footer (contentBottom + FOOTER_GAP)
 * - totalHeight: altura total del documento
 */
function computeCondolenciasLayout(blocks, ctx){
  if(!ctx)ctx=getMeasureContext();

  const layoutBlocks=[];
  const allLines=[];
  let currentY=CONTENT_TOP;

  for(let bIdx=0;bIdx<blocks.length;bIdx++){
    const parts=blocks[bIdx];
    const tokens=[];

    for(const part of parts){
      const rawLines=part.text.split("\n");
      for(let l=0;l<rawLines.length;l++){
        if(l>0){
          tokens.push({text:"\n",isNewline:true,style:part.style});
        }
        const segment=rawLines[l];
        if(!segment)continue;
        const words=segment.split(/(\s+)/);
        for(const w of words){
          if(w.length>0){
            tokens.push({text:w,isNewline:false,style:part.style});
          }
        }
      }
    }

    const blockLines=[];
    let currentTokens=[];
    let currentWidth=0;
    let currentLineHeight=34;

    const pushLine=()=>{
      if(currentTokens.length===0)return;
      // Eliminar espacios vacíos al inicio y final para centrado matemático simétrico
      while(currentTokens.length>0 && !currentTokens[0].text.trim()){
        currentTokens.shift();
      }
      while(currentTokens.length>0 && !currentTokens[currentTokens.length-1].text.trim()){
        currentTokens.pop();
      }
      if(currentTokens.length>0){
        let w=0;
        let lh=34;
        for(const t of currentTokens){
          const st=textStyleSpec(t.style);
          ctx.font=st.font;
          t.width=ctx.measureText(t.text).width;
          w+=t.width;
          lh=Math.max(lh,st.lineHeight);
        }
        const lineObj={
          tokens:currentTokens,
          width:w,
          lineHeight:lh,
          y:currentY,
          x:540 - w/2
        };
        blockLines.push(lineObj);
        allLines.push(lineObj);
        currentY+=lh;
      }
      currentTokens=[];
      currentWidth=0;
      currentLineHeight=34;
    };

    for(const token of tokens){
      if(token.isNewline){
        pushLine();
        continue;
      }

      const st=textStyleSpec(token.style);
      ctx.font=st.font;
      const tokenW=ctx.measureText(token.text).width;

      if(currentTokens.length===0 && !token.text.trim()){
        continue;
      }

      if(currentTokens.length>0 && token.text.trim() && (currentWidth+tokenW>MAX_CONTENT_WIDTH)){
        pushLine();
      }

      currentTokens.push(token);
      currentWidth+=tokenW;
      currentLineHeight=Math.max(currentLineHeight,st.lineHeight);
    }
    pushLine();

    layoutBlocks.push({
      lines:blockLines
    });

    if(bIdx<blocks.length-1 && blockLines.length>0){
      currentY+=BLOCK_GAP;
    }
  }

  const contentBottom=currentY;
  const desiredRibbonTop=contentBottom+TEXT_TO_RIBBON_GAP;
  const desiredRibbonBottom=desiredRibbonTop+RIBBON_HEIGHT;
  const footerDrawY=desiredRibbonTop-RIBBON_OFFSET_TOP;
  const totalHeight=Math.round(desiredRibbonBottom+BOTTOM_MARGIN);

  return {
    blocks:layoutBlocks,
    lines:allLines,
    contentBottom,
    desiredRibbonTop,
    desiredRibbonBottom,
    footerDrawY,
    footerTop:footerDrawY, // Compatibilidad DOM
    totalHeight
  };
}

function render(){
  dateRender.textContent=dateInput.value.trim();

  const blocks=blocksFromEditor();
  const layoutData=computeCondolenciasLayout(blocks);

  // Renderizar en el DOM usando la estructura exacta del layout
  contentRender.innerHTML="";
  for(const block of layoutData.blocks){
    const blockDiv=document.createElement("div");
    blockDiv.className="content-block";
    for(const line of block.lines){
      const lineDiv=document.createElement("div");
      lineDiv.className="content-line";
      lineDiv.style.minHeight=`${line.lineHeight}px`;
      for(const t of line.tokens){
        const span=document.createElement("span");
        span.className=t.style;
        span.textContent=t.text;
        lineDiv.appendChild(span);
      }
      blockDiv.appendChild(lineDiv);
    }
    contentRender.appendChild(blockDiv);
  }

  // Aplicar geometría exacta calculada
  footer.style.top=`${layoutData.footerDrawY}px`;
  artboard.style.height=`${layoutData.totalHeight}px`;
  artboard.dataset.height=String(layoutData.totalHeight);
  artboard.dataset.footerTop=String(layoutData.footerDrawY);

  fitPreview();
}

function fitPreview(){
  const stage=document.querySelector(".stage");
  if(!stage || !previewShell || !previewViewport)return;

  const horizontalPadding=window.innerWidth<=900 ? 20 : 56;
  const available=Math.max(240,stage.clientWidth-horizontalPadding);
  const scale=Math.min(1,available/1080);
  const naturalHeight=Number(artboard.dataset.height||0);

  previewShell.style.width="1080px";
  previewShell.style.height=`${naturalHeight}px`;
  previewShell.style.transform=`scale(${scale})`;

  previewViewport.style.width=`${Math.round(1080*scale)}px`;
  previewViewport.style.height=`${Math.round(naturalHeight*scale)}px`;
}

function drawCenteredLine(ctx,line){
  let x=line.x;
  const maxFontSize=Math.max(...line.tokens.map(t=>textStyleSpec(t.style).size));
  const baseline=line.y+(line.lineHeight-maxFontSize)/2+maxFontSize*0.82;

  for(const token of line.tokens){
    const st=textStyleSpec(token.style);
    ctx.font=st.font;
    ctx.fillStyle="#111";
    ctx.textBaseline="alphabetic";
    ctx.fillText(token.text,x,baseline);
    x+=token.width||ctx.measureText(token.text).width;
  }
}

async function loadImage(src){
  return await new Promise((resolve,reject)=>{
    const img=new Image();
    img.onload=()=>resolve(img);
    img.onerror=()=>reject(new Error(`No se pudo cargar ${src}`));
    img.src=src;
  });
}

function canvasToBlob(canvas){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(
      b=>b?resolve(b):reject(new Error("No se pudo crear el archivo PNG.")),
      "image/png"
    );
  });
}

function downloadBlob(blob,filename){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url;
  a.download=filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2500);
}

function rasterizeTemplate(baseImage){
  const canvas=document.createElement("canvas");
  canvas.width=1080;
  canvas.height=760;
  const ctx=canvas.getContext("2d");
  ctx.drawImage(baseImage,0,0,1080,760);
  return canvas;
}

async function renderOriginalCanvas(baseImage,blocks){
  const ctxDummy=getMeasureContext();
  const layoutData=computeCondolenciasLayout(blocks, ctxDummy);
  const templateCanvas=rasterizeTemplate(baseImage);

  const canvas=document.createElement("canvas");
  canvas.width=1080;
  canvas.height=layoutData.totalHeight;
  const ctx=canvas.getContext("2d");

  // Fondo blanco base
  ctx.fillStyle="#fff";
  ctx.fillRect(0,0,1080,layoutData.totalHeight);

  // 1. Cabecera SVG (0 a 210 px)
  ctx.drawImage(templateCanvas,0,0,1080,210,0,0,1080,210);

  // 2. Fecha (coordenada fija según plantilla)
  ctx.fillStyle="#111";
  ctx.font="400 17.68px Raleway, Montserrat, Arial";
  ctx.textBaseline="alphabetic";
  ctx.fillText(dateInput.value.trim(),50,54);

  // 3. Contenido tipográfico (consumiendo las coordenadas unificadas del layout)
  for(const line of layoutData.lines){
    drawCenteredLine(ctx,line);
  }

  // 4. Footer "Descanse en paz"
  ctx.drawImage(
    templateCanvas,
    0,
    FOOTER_SOURCE_Y,
    1080,
    FOOTER_SOURCE_HEIGHT,
    0,
    layoutData.footerDrawY,
    1080,
    FOOTER_SOURCE_HEIGHT
  );

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

async function downloadDesktop(files){
  if(files.length===1){
    downloadBlob(files[0],files[0].name);
    return "Se descargó la condolencia original.";
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
  downloadBlob(blob,`condolencias_original_y_4x5_${new Date().toISOString().slice(0,10)}.zip`);
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
        ?"Condolencias original y adaptación 4:5"
        :"Condolencias"
    });
    return files.length===2
      ?"Las dos imágenes están listas para guardar o compartir."
      :"La imagen está lista para guardar o compartir.";
  }

  return downloadDesktop(files);
}

async function exportPNG(){
  exportBtn.disabled=true;
  exportBtn.textContent="Generando…";
  status.textContent="Generando imagen…";

  try{
    await document.fonts.ready;
    render();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));

    const base=await loadImage("assets/templates/condolencias-base.svg?v=1455");
    const blocks=blocksFromEditor();
    const originalCanvas=await renderOriginalCanvas(base,blocks);
    const originalBlob=await canvasToBlob(originalCanvas);
    const date=new Date().toISOString().slice(0,10);

    const files=[
      new File(
        [originalBlob],
        `condolencias_original_${date}.png`,
        {type:"image/png"}
      )
    ];

    const socialCanvas=createSocialCanvas(originalCanvas);
    let hasSocial=false;
    if(socialCanvas){
      hasSocial=true;
      const socialBlob=await canvasToBlob(socialCanvas);
      files.push(
        new File(
          [socialBlob],
          `condolencias_4x5_${date}.png`,
          {type:"image/png"}
        )
      );
    }

    if(hasSocial){
      status.textContent=`Generando original (${originalCanvas.height}px) y adaptación 4:5…`;
    }else if(originalCanvas.height===SOCIAL_HEIGHT){
      status.textContent="El original ya mide 1080 × 1350. No necesita adaptación.";
    }else{
      status.textContent=`El original mide ${originalCanvas.height}px de alto. Se exportará sin adaptación 4:5.`;
    }

    const message=await shareOrDownload(files);
    status.textContent=message;
  }catch(err){
    console.error(err);
    status.textContent=`Error: ${err.message||err}`;
    alert(`No se pudo exportar.\n${err.message||err}`);
  }finally{
    exportBtn.disabled=false;
    exportBtn.textContent="Exportar PNG";
  }
}

document.querySelectorAll("[data-style]").forEach(btn=>
  btn.addEventListener("click",()=>applyStyle(btn.dataset.style))
);
document.getElementById("undoBtn").addEventListener("click",()=>document.execCommand("undo"));
editor.addEventListener("input",()=>{normalizeEditor();render();});
dateInput.addEventListener("input",render);
exportBtn.addEventListener("click",exportPNG);
window.addEventListener("resize",fitPreview);

seedEditor();
render();
})();
