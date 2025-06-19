import express, { Request, Response } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import crypto from 'crypto';
import TelegramBot from 'node-telegram-bot-api';
import { PrismaClient } from '../src/generated/prisma';
import dotenv from 'dotenv';

dotenv.config();
const PORT = process.env.PORT || 3001;
const prisma = new PrismaClient();
const ADMIN_ID = process.env.TELEGRAM_ADMIN_ID;
const token = process.env.TELEGRAM_BOT_TOKEN!;
const bot = new TelegramBot(token, { polling: true });

const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: 'https://telegram-test-bot-murex.vercel.app' }));

bot.onText(/\/start/, async (msg) => {
	const chatId = msg.chat.id;
	const inlineKeyboard = [
		[
			{
				text: 'Открыть Mini App',
				web_app: { url: process.env.MINI_APP_URL! },
			},
		],
	];
	await bot.sendMessage(chatId, 'Добро пожаловать! Нажмите кнопку ниже:', {
		reply_markup: { inline_keyboard: inlineKeyboard },
	});
});

function verifyInitData(initData: string, botToken: string): boolean {
	const params = new URLSearchParams(initData);
	const hash = params.get('hash')!;
	const dataCheckArr = [...params]
		.filter(([k]) => k !== 'hash')
		.map(([k, v]) => `${k}=${v}`)
		.sort();
	const dataCheckString = dataCheckArr.join('\n');
	const secretKey = crypto.createHmac('sha256', botToken).digest();
	const computedHash = crypto
		.createHmac('sha256', secretKey)
		.update(dataCheckString)
		.digest('hex');
	return computedHash === hash;
}

// Эндпоинт /api/get-role
app.post('/api/get-role', async (req: Request, res: any) => {
	try {
		const { initData } = req.body as { initData: string };

		if (!initData) {
			return res.status(400).json({ error: 'No initData provided' });
		}

		// 1) Проверяем подпись
		// if (!verifyInitData(initData, token)) {
		// 	return res.status(400).json({ error: 'Invalid initData signature' });
		// }

		// 2) Парсим user
		const params = new URLSearchParams(initData);
		const user = JSON.parse(params.get('user') || '{}');
		const userId = user.id.toString();

		// 3) Ищем или создаём
		let userInDb = await prisma.user.findUnique({
			where: { telegramId: userId },
		});

		if (!userInDb) {
			const role = userId === ADMIN_ID ? 'admin' : 'user';

			try {
				userInDb = await prisma.user.create({
					data: {
						telegramId: userId,
						role,
					},
				});
			} catch (createError) {
				console.error('Ошибка создания пользователя:', createError);
				return res.status(500).json({ error: 'Failed to create user' });
			}
		}

		// 4) Возвращаем роль
		res.json({
			id: userInDb?.id,
			telegramId: userInDb?.telegramId,
			role: userInDb?.role,
		});
	} catch (err) {
		console.error('Server error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});

app.listen(PORT, () => {
	console.log(`Backend running on port ${PORT}`);
});
