let PROJECT_CONFIG=null,ACTIVE_TEMPLATE=null;
const ui={templateSelect:document.getElementById("templateSelect"),bodyInput:document.getElementById("bodyInput"),signatureInput:document.getElementById("signatureInput"),dateInput:document.getElementById("dateInput"),exportPngBtn:document.getElementById("exportPngBtn")};
const sampleData={body:`Estimados compañeros, informamos que *el Ing. Paúl Sandoval* hará uso de sus vacaciones desde el *24 de junio hasta el 6 de julio de 2026.*

Durante este periodo deberán considerar:

- Solicitar vehículos con anticipación.
- Remitir la solicitud al correo institucional.
- Copiar a la Dirección Administrativa.

> Este párrafo tiene una sangría simple para notas o aclaraciones.

>> Este párrafo tiene doble sangría.

Agradecemos su atención y colaboración.`,signature:"DIRECCIÓN ADMINISTRATIVA",date:"24 de junio de 2026"};
function getCurrentData(){return{body:ui.bodyInput.value,signature:ui.signatureInput.value,date:ui.dateInput.value}}
function populateTemplateSelect(){ui.templateSelect.innerHTML="";for(const[id,t]of Object.entries(PROJECT_CONFIG.templates)){const o=document.createElement("option");o.value=id;o.textContent=t.name;ui.templateSelect.appendChild(o)}}
async function activateTemplate(id){ACTIVE_TEMPLATE=PROJECT_CONFIG.templates[id];setupTemplate(ACTIVE_TEMPLATE,await loadTemplateSVG(id));renderContent(ACTIVE_TEMPLATE,getCurrentData())}
async function init(){PROJECT_CONFIG=await loadProjectConfig();ui.bodyInput.value=sampleData.body;ui.signatureInput.value=sampleData.signature;ui.dateInput.value=sampleData.date;populateTemplateSelect();await activateTemplate(ui.templateSelect.value);ui.templateSelect.addEventListener("change",e=>activateTemplate(e.target.value));ui.bodyInput.addEventListener("input",()=>renderContent(ACTIVE_TEMPLATE,getCurrentData()));ui.signatureInput.addEventListener("input",()=>renderContent(ACTIVE_TEMPLATE,getCurrentData()));ui.dateInput.addEventListener("input",()=>renderContent(ACTIVE_TEMPLATE,getCurrentData()));ui.exportPngBtn.addEventListener("click",()=>DaedalusExporter.exportPNG(ACTIVE_TEMPLATE,ui.exportPngBtn))}
window.addEventListener("error", event => {
  const status = document.getElementById("startupStatus");
  if (status) {
    status.textContent = "Error al iniciar: " + (event.message || "archivo no cargado");
    status.classList.add("error");
  }
});

document.fonts.ready
  .then(init)
  .then(() => {
    const status = document.getElementById("startupStatus");
    if (status) {
      status.textContent = "Listo";
      status.classList.add("ready");
    }
  })
  .catch(error => {
    console.error(error);
    const status = document.getElementById("startupStatus");
    if (status) {
      status.textContent = "No se pudo iniciar el motor: " + error.message;
      status.classList.add("error");
    }
  });