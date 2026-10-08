import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve('../.env') }); 

import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import OpenAI from 'openai';
import { rotasDeAutenticacao } from './auth.js'; // NOVO: login + cadastro (usuários fixos continuam valendo)

const app = express();
const PORT = 3000;

// Configuração correta de cabeçalhos e CORS para evitar qualquer bloqueio local
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(bodyParser.json());

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY }); 

// ROTAS DE LOGIN E CADASTRO (/api/login e /api/registrar) — o admin e o aluno fixos estão em auth.js
rotasDeAutenticacao(app);

// CONFIGURAÇÃO DAS FERRAMENTAS DO ASSISTENTE
const ferramentasIA = [
  {
    type: "function",
    function: {
      name: "salvarNoBancoDeDados",
      description: "Registra um item achado ou perdido no sistema após coletar o tipo, item e local.",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["achado", "perdido"] },
          item: { type: "string", description: "O nome do objeto." },
          local: { type: "string", description: "Onde o item foi visto." },
          descricao: { type: "string", description: "Características extras." }
        },
        required: ["tipo", "item", "local"]
      }
    }
  }
];

const SYSTEM_PROMPT = `
Você é o assistente virtual de Achados e Perdidos do CEEP Curitiba.
Seu papel é coletar com precisão: o Tipo (se foi achado ou perdido), o Nome do Item e o Local dentro do colégio.
Assim que conseguir os 3 dados, acione a ferramenta 'salvarNoBancoDeDados' imediatamente.
`;

// ROTA DO CHAT DO ASSISTENTE
app.post('/api/chat', async (req, res) => {
  try {
    const { historicoMensagens } = req.body;
    let dadosItemExtraidos = null;

    if (!historicoMensagens) {
      return res.status(400).json({ erro: "Histórico ausente." });
    }

    const respuesta = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...historicoMensagens],
      tools: ferramentasIA, 
      tool_choice: "auto"
    });

    // CORREÇÃO EFETUADA: Removido o [0] de choices para adequação ao SDK atual
    const mensagemIA = respuesta.choices.message; 

    if (mensagemIA.tool_calls && mensagemIA.tool_calls.length > 0) {
      const chamadaDeFuncao = mensagemIA.tool_calls;
      
      if (chamadaDeFuncao.function.name === "salvarNoBancoDeDados") {
        const argumentos = JSON.parse(chamadaDeFuncao.function.arguments);
        const idGerado = Math.floor(Math.random() * 10000);
        
        dadosItemExtraidos = {
            id: idGerado,
            tipo: argumentos.tipo,
            item: argumentos.item,
            local: argumentos.local,
            desc: argumentos.descricao || "Capturado automaticamente via Chatbot"
        };

        const respostaFinalIA = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: SYSTEM_PROMPT },
                ...historicoMensagens,
                mensagemIA,
                {
                    role: "tool",
                    tool_call_id: chamadaDeFuncao.id,
                    name: chamadaDeFuncao.function.name,
                    content: JSON.stringify({ status: "sucesso", id_registro: idGerado })
                }
            ]
        });

        // CORREÇÃO EFETUADA: Removido o [0] de choices também na resposta estruturada
        return res.json({ 
            respostaDaIA: respostaFinalIA.choices.message.content,
            itemRegistrado: dadosItemExtraidos
        });
      }
    }

    res.json({ respostaDaIA: mensagemIA.content, itemRegistrado: null });

  } catch (error) {
    console.error("Erro interno no servidor do chat:", error);
    res.status(500).json({ erro: "Erro ao processar conversa com a IA." });
  }
});

// INICIALIZAÇÃO DO SERVIDOR FORÇANDO IPV4 UNIVERSAL
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor do CEEP rodando com sucesso em http://127.0.0.1:${PORT}`);
});