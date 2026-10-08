import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

// As contas criadas pelo site ficam em "usuarios.json", na mesma pasta deste arquivo.
const ARQUIVO_USUARIOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'usuarios.json');

// USUÁRIOS FIXOS (os mesmos que já existiam): continuam valendo exatamente como antes.
const usuariosFixos = [
    { email: "admin@ceep.com", senha: "3DAM1", role: "admin" },
    { email: "aluno@ceep.com", senha: "cadastro", role: "aluno" }
];

const normalizarEmail = (email) => String(email || '').trim().toLowerCase();

function lerUsuarios() {
    try {
        return JSON.parse(fs.readFileSync(ARQUIVO_USUARIOS, 'utf-8'));
    } catch (error) {
        if (error.code === 'ENOENT') return []; // arquivo ainda não existe: ninguém se cadastrou
        throw error; // arquivo corrompido: melhor falhar do que sobrescrever e perder contas
    }
}

// As senhas das contas novas são guardadas com hash (nunca em texto puro).
function gerarHash(senha) {
    return new Promise((resolve, reject) => {
        const salt = crypto.randomBytes(16).toString('hex');
        crypto.scrypt(senha, salt, 64, (err, chave) => {
            if (err) return reject(err);
            resolve(`${salt}:${chave.toString('hex')}`);
        });
    });
}

function conferirHash(senha, armazenado) {
    return new Promise((resolve, reject) => {
        const [salt, hash] = String(armazenado).split(':');
        crypto.scrypt(senha, salt, 64, (err, chave) => {
            if (err) return reject(err);
            resolve(crypto.timingSafeEqual(Buffer.from(hash, 'hex'), chave));
        });
    });
}

export function rotasDeAutenticacao(app) {

    // ROTA DE LOGIN (mesma resposta de antes: { status, role })
    app.post('/api/login', async (req, res) => {
        try {
            const { email, senha } = req.body;

            if (!email || !senha) {
                return res.status(400).json({ erro: "E-mail e senha são obrigatórios." });
            }

            const emailNormalizado = normalizarEmail(email);

            // 1) usuários fixos (admin e aluno padrão)
            const fixo = usuariosFixos.find(u => u.email === emailNormalizado && u.senha === senha);
            if (fixo) {
                return res.json({ status: "autenticado", role: fixo.role });
            }

            // 2) contas criadas pelo site
            const conta = lerUsuarios().find(u => u.email === emailNormalizado);
            if (conta && await conferirHash(String(senha), conta.senhaHash)) {
                return res.json({ status: "autenticado", role: conta.role });
            }

            return res.status(401).json({ erro: "E-mail ou senha incorretos." });
        } catch (error) {
            console.error("Erro interno na rota de login:", error);
            res.status(500).json({ erro: "Erro interno no servidor de autenticação." });
        }
    });

    // ROTA DE CADASTRO (cria sempre uma conta de "aluno"; admin só existe na lista fixa acima)
    app.post('/api/registrar', async (req, res) => {
        try {
            const email = normalizarEmail(req.body?.email);
            const senha = String(req.body?.senha ?? '');

            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 100) {
                return res.status(400).json({ erro: "Informe um e-mail válido." });
            }
            if (senha.length < 6 || senha.length > 100) {
                return res.status(400).json({ erro: "A senha deve ter entre 6 e 100 caracteres." });
            }
            if (usuariosFixos.some(u => u.email === email)) {
                return res.status(409).json({ erro: "Este e-mail já está cadastrado." });
            }

            const senhaHash = await gerarHash(senha);

            // Do ponto abaixo até o writeFileSync não há "await", então dois cadastros
            // ao mesmo tempo não conseguem sobrescrever um ao outro.
            const usuarios = lerUsuarios();
            if (usuarios.some(u => u.email === email)) {
                return res.status(409).json({ erro: "Este e-mail já está cadastrado." });
            }
            usuarios.push({ email, senhaHash, role: "aluno", criadoEm: new Date().toISOString() });
            fs.writeFileSync(ARQUIVO_USUARIOS, JSON.stringify(usuarios, null, 2), 'utf-8');

            return res.status(201).json({ status: "criado", role: "aluno" });
        } catch (error) {
            console.error("Erro interno na rota de cadastro:", error);
            res.status(500).json({ erro: "Erro interno ao criar a conta." });
        }
    });
}