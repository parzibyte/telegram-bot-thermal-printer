require("dotenv").config();
const fs = require("node:fs");
const nombreArchivoPreferencias = "impresoras.json";
const TelegramBot = require('node-telegram-bot-api');
const token = process.env.TELEGRAM_BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });
const serial = process.env.LICENCIA_PLUGIN;
let idsUsuarioConImpresoraPreferida = {};
const ALGORITMO_RASTER_BIT_IMAGE = 0;
const MAXIMO_ANCHO = 380;
fs.readFile(nombreArchivoPreferencias, (err, data) => {
    if (err) {
        return;
    }
    idsUsuarioConImpresoraPreferida = JSON.parse(data.toString());
})

const guardarPreferencias = (cb) => {
    fs.writeFile(nombreArchivoPreferencias, JSON.stringify(idsUsuarioConImpresoraPreferida), cb);
}

const obtenerVersion = async () => {
    try {
        const urlInvocacion = `http://localhost:8000/version`;
        const httpResponse = await fetch(urlInvocacion);
        return await httpResponse.json();
    } catch (e) {
        return e.message;
    }
}
const obtenerImpresoras = async () => {
    try {
        const urlInvocacion = `http://localhost:8000/impresoras`;
        const httpResponse = await fetch(urlInvocacion);
        return await httpResponse.json();
    } catch (e) {
        return e.message;
    }
}
bot.on('callback_query', (query) => {
    const idChat = query.message.chat.id;
    const impresoraSeleccionada = query.data;
    const idUsuario = query.from.id;
    idsUsuarioConImpresoraPreferida[idUsuario] = impresoraSeleccionada;
    guardarPreferencias(() => {
        bot.sendMessage(idChat, `Tu impresora preferida es ahora '${impresoraSeleccionada}'`);
    });
});


const enviarOperaciones = async (nombreImpresora, operaciones) => {
    try {
        const httpResponse = await fetch("http://localhost:8000/imprimir", {
            method: "POST",
            body: JSON.stringify({
                nombreImpresora: nombreImpresora,
                serial: serial,
                operaciones: operaciones,
            }),
        });
        return httpResponse.json();
    } catch (e) {
        return e.message;
    }
}


const imprimirImagen = async (nombreImpresora, url) => {

    return await enviarOperaciones(nombreImpresora, [
        {
            nombre: "Iniciar",
            argumentos: [],
        },
        {


            nombre: "DescargarImagenDeInternetEImprimir",
            argumentos: [
                url, MAXIMO_ANCHO, ALGORITMO_RASTER_BIT_IMAGE,
            ]
        },
        {
            nombre: "Feed",
            argumentos: [
                1
            ]
        }
    ]);
}
const escribirTexto = async (nombreImpresora, texto) => {
    return await enviarOperaciones(nombreImpresora, [{
        nombre: "Iniciar",
        argumentos: [],
    },
    {
        nombre: "EscribirTexto",
        argumentos: [
            texto
        ]
    },
    {
        nombre: "Feed",
        argumentos: [
            1
        ]
    }
    ]);
}

const descargarHtmlEImprimir = async (nombreImpresora, url) => {
    return await enviarOperaciones(nombreImpresora, [{
        nombre: "Iniciar",
        argumentos: [],
    },
    {
        nombre: "GenerarImagenAPartirDePaginaWebEImprimir",
        argumentos: [
            url, MAXIMO_ANCHO, MAXIMO_ANCHO, ALGORITMO_RASTER_BIT_IMAGE,
        ]
    },
    {
        nombre: "Feed",
        argumentos: [
            1
        ]
    }
    ]);
}

const escribirHtml = async (nombreImpresora, html) => {
    return await enviarOperaciones(nombreImpresora, [{
        nombre: "GenerarImagenAPartirDeHtmlEImprimir",
        argumentos: [html, MAXIMO_ANCHO, MAXIMO_ANCHO, ALGORITMO_RASTER_BIT_IMAGE],
    },
    {
        nombre: "Feed",
        argumentos: [
            1
        ]
    }
    ]);
}


/**
  * @param {number} idChat
  */
const responderConImpresoras = async (idChat) => {
    const impresoras = await obtenerImpresoras();
    if (Array.isArray(impresoras)) {
        const botonesPorFila = 3;
        const botonesBidimensionales = [];
        for (let i = 0; i < impresoras.length; i += botonesPorFila) {
            const filaDeBotones = impresoras.slice(i, i + botonesPorFila);
            botonesBidimensionales.push(filaDeBotones.map(nombreImpresora => ({ text: nombreImpresora, callback_data: nombreImpresora })));
        }
        const teclado = {
            reply_markup: {
                inline_keyboard: botonesBidimensionales,
                resize_keyboard: true,
                one_time_keyboard: true
            }
        };
        await bot.sendMessage(idChat, 'Elige la impresora:', teclado);
    } else {
        await bot.sendMessage(idChat, "Error obteniendo impresoras: " + impresoras);
    }
}


const responderConVersion = async (idChat) => {
    const version = await obtenerVersion();
    if (typeof version !== "string" && version.version) {
        await bot.sendMessage(idChat, `Versión:  *${version.version}*
Plataforma: *${version.plataforma}*
Sistema operativo: *${version.sistemaOperativo}*`, { parse_mode: "Markdown" });
    } else {

        await bot.sendMessage(idChat, "Error obteniendo versión: " + impresoras);
    }
}

const evaluarRespuestaYEnviarMensajeAUsuario = async (respuestaDelPlugin, idChat) => {
    if (respuestaDelPlugin === true) {
        await bot.sendMessage(idChat, "Impreso correctamente");
    } else {
        await bot.sendMessage(idChat, "Error: " + respuestaDelPlugin);

    }
}

const mostrarAyuda = async (idChat) => {
    await bot.sendMessage(idChat, `<b>Configurando plugin</b>
1. Necesitas ejecutar el plugin y configurarlo como se indica en: https://parzibyte.me/blog/
2. Luego, elige tu impresora predeterminada con /impresoras, solo necesitas hacerlo una vez y a partir de ahí se usará la misma impresora para todas las operaciones

<b>Modo de uso</b>
- Todo el texto sin formato que no sea código, comando o URL será impreso como texto en la impresora térmica
- Envía un enlace de una página web <b>que no cargue recursos externos</b> y será impresa como una imagen
- Envía una foto (como foto, no como archivo) y será impresa

- Envía código HTML en el siguiente formato
<code>\`\`\`html
Acá va el HTML
\`\`\`</code>
y será impreso como una página HTML

- Envía un arreglo de operaciones JSON en el siguiente formato 
<code>\`\`\`json
Acá van las operaciones JSON
\`\`\`</code>
 y serán ejecutadas como si estuvieras
invocando al plugin desde un lenguaje de programación. <a href="https://gist.github.com/parzibyte/2f36655ef9d6ea8e6de73c6e09bbc735#file-documentacion-txt">Documentación</a> 

El ancho máximo para todas las imágenes impresas es ${MAXIMO_ANCHO} es y el algoritmo seleccionado es ${ALGORITMO_RASTER_BIT_IMAGE}, pero puede ser 0, 1 o 2. Mira: https://parzibyte.me/blog/2024/01/23/actualizacion-plugin-esc-pos-v3-3-0-algoritmos-imagenes/

También puedes usar los siguientes comandos: 
/impresoras elige la impresora preferida para el usuario
/version muestra la versión del plugin. Útil para conocer el estado de ejecución del plugin
/ayuda muestra este mensaje de ayuda`, { parse_mode: "HTML", disable_web_page_preview: true, });
}

bot.on('message', async (msg) => {
    const idChat = msg.chat.id;
    const idUsuario = msg.from.id;
    if (!idsUsuarioConImpresoraPreferida[idUsuario]) {
        bot.sendMessage(idChat, "Para imprimir, necesitas seleccionar una impresora");
        await responderConImpresoras(idChat);
        return;
    }
    const impresoraPreferida = idsUsuarioConImpresoraPreferida[idUsuario];
    if (msg.entities && msg.entities.length > 0) {
        for (const entidad of msg.entities) {
            const contenidoDeLaEntidad = msg.text.substring(entidad.offset, entidad.offset + entidad.length);
            if (entidad.language === "html") {
                await escribirHtml(impresoraPreferida, contenidoDeLaEntidad);
                await evaluarRespuestaYEnviarMensajeAUsuario(
                    await escribirHtml(impresoraPreferida, contenidoDeLaEntidad), idChat);
            } else if (entidad.language === "json") {
                const operaciones = JSON.parse(contenidoDeLaEntidad);
                if (!Array.isArray(operaciones)) {
                    bot.sendMessage(idChat, "Operaciones JSON deben ser un arreglo");
                    return;
                }
                await evaluarRespuestaYEnviarMensajeAUsuario(
                    await enviarOperaciones(impresoraPreferida, operaciones), idChat);
            } else if (entidad.type === "url") {
                await evaluarRespuestaYEnviarMensajeAUsuario(
                    await descargarHtmlEImprimir(impresoraPreferida, msg.text), idChat);
            } else if (entidad.type === "bot_command") {
                if (contenidoDeLaEntidad === "/version") {
                    await responderConVersion(idChat);
                } else if (contenidoDeLaEntidad === "/impresoras") {
                    await responderConImpresoras(idChat);
                } else if (contenidoDeLaEntidad === "/ayuda") {
                    await mostrarAyuda(idChat);
                }
            }
        }
        return;
    }
    if (msg.text) {
        await evaluarRespuestaYEnviarMensajeAUsuario(
            await escribirTexto(impresoraPreferida, msg.text),
            idChat,
        );
    } else if (msg.photo && msg.photo.length > 0) {
        // Creo que la foto más grande siempre se encuentra en
        // msg.photo[msg.photo.length -1] pero no estoy seguro
        // y la documentación no dice nada sobre ello, así que lo calculo
        // manualmente
        let fotoMasGrande = msg.photo[0];
        for (const foto of msg.photo) {
            if (foto.width > fotoMasGrande.width) {
                fotoMasGrande = foto;
            }
        }
        const urlArchivo = await bot.getFileLink(fotoMasGrande.file_id)
        await evaluarRespuestaYEnviarMensajeAUsuario(
            await imprimirImagen(impresoraPreferida, urlArchivo),
            idChat,
        );
    }
});