// URL de tu Google Sheets publicado como CSV (reemplaza con tu link real)
const SHEET_CSV_URL =
  "https://script.google.com/macros/s/AKfycbyMRQPr1RDTOrU1zZ_cRTgW5XAp98zNEgAcMEeCLAWfNxrghokrHyks2-PbD1_AW7F1hw/exec";
//const URL_WEB_APP =
  //"https://script.google.com/macros/s/AKfycbx4Wb3fcysAo-s3YQFixlkt5XrFD1q9eQp-4yLoccdRHIXAtqjWWdU_8qSAYxHThuZsXg/exec";
//https://docs.google.com/spreadsheets/d/e/2PACX-1vSf7mN6wC1ybMOKz1DXWeVjk_kdH6nhXwJRnVDMFAkODkADBkO21aemrcWQkxDSLGZJnnZIdWlqF3d-/pub?gid=0&single=true&output=csv";

// Preguntas de respaldo (Offline / Garantizadas)
let preguntasRespaldo = [
  {
    id: 1,
    pregunta:
      "¿En qué año fue creada formalmente la Facultad de Medicina de la UBA?",
    opciones: ["1821", "1852", "1887"],
    correcta: 1, // Índice 1 = segunda opción (1852)
    explicacion: "Fue creada formalmente en 1852.",
    imagen: "imagenes/pregunta1.jpg",
  },
  {
    id: 2,
    pregunta: "¿Dónde funciona actualmente la Facultad de Medicina de la UBA?",
    opciones: ["Av. Córdoba", "Paraguay 2155", "Av. Las Heras"],
    correcta: 1,
    explicacion: "Funciona en Paraguay 2155.",
    imagen: "imagenes/pregunta2.jpg",
  },
  // Puedes agregar el resto de tus preguntas aquí o dejarlas sincronizar desde Sheets
];

let preguntasPartida = [];
let indicePreguntaActual = 0;
let puntajeActual = 0;
let respuestasCorrectas = 0;
let nombreJugador = "";
let temporizadorPregunta = null;
let temporizadorAvance = null;
let preguntaRespondida = false;
let contextoAudio = null;
let inicioPregunta = null;
let tiempoTotalRespuesta = 0;
const TIEMPO_POR_PREGUNTA = 15;
const TIEMPO_EXPLICACION = 3000;

// Inicialización al cargar la página
window.addEventListener("DOMContentLoaded", () => {
  // Intentar actualizar desde Google Sheets en segundo plano
  sincronizarGoogleSheets();

  document.getElementById("btn-comenzar").addEventListener("click", () => {
    const input = document.getElementById("nombre-jugador");
    nombreJugador = input.value.trim();

    if (nombreJugador === "") {
      alert("Por favor, ingresa un nombre válido para continuar.");
      input.focus();
      return;
    }

    iniciarTrivia();
  });
});

async function sincronizarGoogleSheets() {
  try {
    const respuesta = await fetch(SHEET_CSV_URL);
    if (!respuesta.ok) throw new Error("Error de red");
    const datosCSV = await respuesta.text();
    const preguntasRemotas = parsearCSV(datosCSV);
    if (preguntasRemotas.length > 0) {
      localStorage.setItem(
        "trivia_preguntas_cache",
        JSON.stringify(preguntasRemotas),
      );
      console.log("Preguntas sincronizadas con Google Sheets exitosamente.");
    }
  } catch (error) {
    console.log("Modo offline o error de CORS. Usando caché local o respaldo.");
  }
}

function parsearCSV(text) {
  const lineas = text.split("\n");
  let resultado = [];
  for (let i = 1; i < lineas.length; i++) {
    let linea = lineas[i].trim();
    if (!linea) continue;
    let cols = linea.split(","); // Nota: si tus celdas tienen comas, asegúrate de limpiarlas
    if (cols.length >= 8) {
      resultado.push({
        id: cols[0],
        pregunta: cols[1],
        opciones: [cols[2], cols[3], cols[4]],
        correcta: parseInt(cols[5]) - 1,
        explicacion: cols[6],
        imagen: "imagenes/" + cols[7].trim(),
      });
    }
  }
  return resultado;
}

function obtenerPreguntasDisponibles() {
  let cache = localStorage.getItem("trivia_preguntas_cache");
  if (cache) {
    try {
      return JSON.parse(cache);
    } catch (e) {
      return preguntasRespaldo;
    }
  }
  return preguntasRespaldo;
}

function iniciarTrivia() {
  clearInterval(temporizadorPregunta);
  clearTimeout(temporizadorAvance);
  prepararAudio();
  let pool = obtenerPreguntasDisponibles();
  // Mezclar aleatoriamente y tomar 10 (o las que haya)
  preguntasPartida = [...pool].sort(() => Math.random() - 0.5).slice(0, 10);
  indicePreguntaActual = 0;
  puntajeActual = 0;
  respuestasCorrectas = 0;
  tiempoTotalRespuesta = 0;

  // Cambiar de pantalla
  document.getElementById("pantalla-inicio").style.display = "none";
  document.getElementById("pantalla-juego").style.display = "flex";

  document.getElementById("info-jugador").textContent =
    `Jugador: ${nombreJugador}`;

  mostrarPreguntaActual();
}

function formatearPuntaje(valor) {
  return Number(valor)
    .toFixed(3)
    .replace(/\.0+$|(?<=\.\d)0+$/g, "");
}

function mostrarPreguntaActual() {
  clearInterval(temporizadorPregunta);
  clearTimeout(temporizadorAvance);
  if (indicePreguntaActual >= preguntasPartida.length) {
    finalizarTrivia();
    return;
  }

  preguntaRespondida = false;
  document.getElementById("tiempo-restante").textContent = TIEMPO_POR_PREGUNTA;
  document.querySelector(".reloj-pregunta").classList.remove("reloj-urgente");
  document.getElementById("explicacion-texto").style.display = "none";
  const q = preguntasPartida[indicePreguntaActual];
  document.getElementById("info-puntaje").textContent =
    `Puntaje: ${formatearPuntaje(puntajeActual)}`;
  document.getElementById("texto-pregunta").textContent =
    `${indicePreguntaActual + 1}. ${q.pregunta}`;

  // Manejo de imagen JPG
  const contenedorImg = document.getElementById("contenedor-imagen");
  contenedorImg.innerHTML = "";
  if (q.imagen) {
    let img = document.createElement("img");
    img.src = q.imagen;
    img.alt = "Imagen de la pregunta";
    img.style.maxHeight = "200px";
    img.style.display = "block";
    img.style.margin = "10px auto";
    contenedorImg.appendChild(img);
  }

  // Opciones
  const opcionesContainer = document.getElementById("opciones-container");
  opcionesContainer.innerHTML = "";

  q.opciones.forEach((opcion, index) => {
    let btn = document.createElement("button");
    btn.textContent = opcion;
    btn.className = "btn-opcion";
    btn.onclick = () => evaluarRespuesta(index, q.correcta);
    opcionesContainer.appendChild(btn);
  });

  iniciarTemporizador();
}

function iniciarTemporizador() {
  const barraTiempo = document.getElementById("barra-tiempo");
  const contenedorBarra = barraTiempo.parentElement;
  const inicio = performance.now();
  inicioPregunta = inicio;

  barraTiempo.style.width = "100%";
  document.getElementById("tiempo-restante").textContent = TIEMPO_POR_PREGUNTA;
  contenedorBarra.setAttribute("aria-valuenow", TIEMPO_POR_PREGUNTA);
  contenedorBarra.setAttribute(
    "aria-valuetext",
    `${TIEMPO_POR_PREGUNTA} segundos`,
  );

  temporizadorPregunta = setInterval(() => {
    const tiempoRestante = Math.max(
      0,
      TIEMPO_POR_PREGUNTA - (performance.now() - inicio) / 1000,
    );
    const segundosRestantes = Math.ceil(tiempoRestante);

    barraTiempo.style.width = `${(tiempoRestante / TIEMPO_POR_PREGUNTA) * 100}%`;
    document.getElementById("tiempo-restante").textContent = segundosRestantes;
    contenedorBarra.setAttribute("aria-valuenow", segundosRestantes);
    contenedorBarra.setAttribute(
      "aria-valuetext",
      `${segundosRestantes} segundos`,
    );
    document
      .querySelector(".reloj-pregunta")
      .classList.toggle("reloj-urgente", tiempoRestante <= 5);

    if (tiempoRestante <= 0) {
      clearInterval(temporizadorPregunta);
      temporizadorPregunta = null;
      tiempoAgotado();
    }
  }, 1000);
}

function mostrarExplicacion(mensaje) {
  const explicacion = document.getElementById("explicacion-texto");
  explicacion.textContent = mensaje;
  explicacion.style.display = "block";
}

function registrarTiempoRespuesta() {
  if (inicioPregunta === null) return 0;

  const tiempoTranscurrido = Math.min(
    TIEMPO_POR_PREGUNTA,
    Math.max(0, (performance.now() - inicioPregunta) / 1000),
  );
  tiempoTotalRespuesta += tiempoTranscurrido;
  inicioPregunta = null;
  return tiempoTranscurrido;
}

function evaluarRespuesta(elegida, correcta) {
  if (preguntaRespondida) return;
  preguntaRespondida = true;
  clearInterval(temporizadorPregunta);
  const tiempoRespuesta = registrarTiempoRespuesta();
  const botones = document.querySelectorAll(".btn-opcion");
  botones.forEach((b) => (b.disabled = true)); // Desactivar clics múltiples

  const pregunta = preguntasPartida[indicePreguntaActual];
  let mensajeExplicacion = "";

  if (elegida === correcta) {
    const puntosMaximosPregunta = 100 / preguntasPartida.length;
    const bonusRapidez =
      puntosMaximosPregunta * 0.5 * (1 - tiempoRespuesta / TIEMPO_POR_PREGUNTA);
    puntajeActual += puntosMaximosPregunta * 0.5 + bonusRapidez;
    respuestasCorrectas++;
    botones[elegida].style.backgroundColor = "#4CAF50"; // Verde
    mensajeExplicacion = `¡Correcto! Sumaste ${Math.round(puntosMaximosPregunta * 0.5 + bonusRapidez)} puntos. ${pregunta.explicacion || "La respuesta elegida fue la correcta."}`;
    reproducirSonido("correcta");
  } else {
    botones[elegida].style.backgroundColor = "#f44336"; // Rojo
    botones[correcta].style.backgroundColor = "#4CAF50"; // Marcar la correcta
    mensajeExplicacion = `Respuesta incorrecta. ${pregunta.explicacion || "La respuesta correcta fue la opción resaltada en verde."}`;
    reproducirSonido("incorrecta");
  }

  document.getElementById("info-puntaje").textContent =
    `Puntaje: ${Math.round(puntajeActual)}`;
  mostrarExplicacion(mensajeExplicacion);

  temporizadorAvance = setTimeout(() => {
    indicePreguntaActual++;
    mostrarPreguntaActual();
  }, TIEMPO_EXPLICACION);
}

function tiempoAgotado() {
  if (preguntaRespondida) return;
  preguntaRespondida = true;
  registrarTiempoRespuesta();
  reproducirSonido("tiempoAgotado");

  const pregunta = preguntasPartida[indicePreguntaActual];
  const botones = document.querySelectorAll(".btn-opcion");
  botones.forEach((boton) => (boton.disabled = true));
  botones[pregunta.correcta].style.backgroundColor = "#4CAF50";

  mostrarExplicacion(
    `Se acabó el tiempo. ${pregunta.explicacion || "La respuesta correcta está marcada en verde."}`,
  );

  temporizadorAvance = setTimeout(() => {
    indicePreguntaActual++;
    mostrarPreguntaActual();
  }, TIEMPO_EXPLICACION);
}

function prepararAudio() {
  const AudioContextDisponible =
    window.AudioContext || window.webkitAudioContext;
  if (!AudioContextDisponible) {
    console.warn("Este navegador no admite la reproducción de sonidos.");
    return;
  }

  if (!contextoAudio) {
    contextoAudio = new AudioContextDisponible();
  }

  contextoAudio.resume().catch((error) => {
    console.error("No se pudo activar el audio de la trivia.", error);
  });
}

function reproducirSonido(tipo) {
  if (!contextoAudio) return;

  const secuencias = {
    correcta: [
      { frecuencia: 523.25, duracion: 0.14 },
      { frecuencia: 659.25, duracion: 0.14 },
      { frecuencia: 783.99, duracion: 0.2 },
    ],
    incorrecta: [
      { frecuencia: 311.13, duracion: 0.2 },
      { frecuencia: 233.08, duracion: 0.28 },
    ],
    tiempoAgotado: [
      { frecuencia: 392, duracion: 0.22 },
      { frecuencia: 293.66, duracion: 0.3 },
    ],
  };
  const secuencia = secuencias[tipo];
  let inicio = contextoAudio.currentTime;

  secuencia.forEach(({ frecuencia, duracion }) => {
    const oscilador = contextoAudio.createOscillator();
    const volumen = contextoAudio.createGain();
    oscilador.type = "sine";
    oscilador.frequency.setValueAtTime(frecuencia, inicio);
    volumen.gain.setValueAtTime(0.0001, inicio);
    volumen.gain.exponentialRampToValueAtTime(0.16, inicio + 0.02);
    volumen.gain.exponentialRampToValueAtTime(0.0001, inicio + duracion);
    oscilador.connect(volumen);
    volumen.connect(contextoAudio.destination);
    oscilador.start(inicio);
    oscilador.stop(inicio + duracion);
    inicio += duracion;
  });
}

function finalizarTrivia() {
  clearInterval(temporizadorPregunta);
  clearTimeout(temporizadorAvance);
  document.getElementById("pantalla-juego").style.display = "none";
  document.getElementById("pantalla-final").style.display = "block";

  const puntajeFinal = Math.min(100, Math.round(puntajeActual));
  const totalPreguntas = preguntasPartida.length;
  const porcentaje = totalPreguntas > 0
    ? Math.round((respuestasCorrectas / totalPreguntas) * 100)
    : 0;
  const tiempoTotal = Math.round(tiempoTotalRespuesta * 10) / 10;
  const categoria = obtenerCategoria(puntajeFinal);

  document.getElementById("resultado-final").textContent =
    `¡Excelente trabajo, ${nombreJugador}!`;
  document.getElementById("resultado-categoria").textContent =
    `Tu puntaje final es de ${puntajeFinal} puntos.`;
  document.getElementById("resultado-detalle").textContent =
    `${categoria} · ${porcentaje}% de respuestas correctas · ${tiempoTotal} segundos`;

  guardarEnRanking(
    nombreJugador,
    puntajeFinal,
    porcentaje,
    tiempoTotal,
    categoria,
  );
  guardarPuntajeEnRanking(
    nombreJugador,
    puntajeFinal,
    respuestasCorrectas,
    totalPreguntas,
    porcentaje,
    tiempoTotal,
  );
}

function obtenerCategoria(puntos) {
  if (puntos <= 50) return "Explorador novato";
  if (puntos < 80) return "Explorador avanzado";
  return "Maestro explorador";
}

async function guardarPuntajeEnRanking(
  nombreJugador,
  puntos,
  correctasTotales,
  cantidadPreguntas,
  porcentaje,
  tiempo,
) {
  const datosJugador = {
    nombre: nombreJugador,
    puntaje: puntos,
    correctas: correctasTotales,
    total: puntos,
    Cantidad_preguntas: cantidadPreguntas,
    porcentaje,
    tiempo,
  };
  const estadoGuardado = document.getElementById("estado-guardado");
  estadoGuardado.textContent = "Enviando el resultado a Google Sheets...";

  try {
    await fetch(SHEET_CSV_URL , {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(datosJugador),
    });
    estadoGuardado.textContent = "Resultado enviado.";
  } catch (error) {
    console.error("No se pudo enviar el puntaje a Google Sheets.", error);
    estadoGuardado.textContent =
      "No se pudo enviar el resultado a Google Sheets. Revisá la conexión e intentá nuevamente.";
  }
}

function guardarEnRanking(nombre, puntos, porcentaje, tiempo, categoria) {
  let ranking = JSON.parse(localStorage.getItem("API_Trivia_Ranking")) || [];
  ranking.push({
    fecha: new Date().toLocaleDateString(),
    nombre,
    puntos,
    porcentaje,
    tiempo,
    categoria,
  });
  ranking.sort((a, b) => {
    const diferenciaPuntaje = b.puntos - a.puntos;
    if (diferenciaPuntaje !== 0) return diferenciaPuntaje;
    if (Number.isFinite(a.tiempo) && Number.isFinite(b.tiempo)) {
      return a.tiempo - b.tiempo;
    }
    return 0;
  });
  ranking = ranking.slice(0, 5); // Top 5
  localStorage.setItem("API_Trivia_Ranking", JSON.stringify(ranking));
}

function actualizarRankingVisual() {
  const lista = document.getElementById("lista-ranking");
  let ranking = JSON.parse(localStorage.getItem("API_Trivia_Ranking")) || [];

  if (ranking.length === 0) {
    lista.innerHTML = "<li>Aún no hay registros de puntajes.</li>";
    return;
  }

  lista.innerHTML = "";
  ranking.forEach((item, index) => {
    let li = document.createElement("li");
    const categoria = item.categoria || obtenerCategoria(item.puntos);
    const detalle = Number.isFinite(item.porcentaje)
      ? ` · ${item.porcentaje}% · ${item.tiempo} s`
      : "";
    li.textContent = `${item.nombre} - ${item.puntos} pts · ${categoria}${detalle}`;
    lista.appendChild(li);
  });
}
