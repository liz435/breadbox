import { join } from "path";
import { mkdir } from "fs/promises";
import {
  characterSessionFileSchema,
  type CharacterAsset,
  type CharacterAssetType,
  type CharacterSessionFile,
} from "./schemas";

const SESSIONS_DIR = join(import.meta.dir, "../../data/character-sessions");
const ASSETS_DIR = join(import.meta.dir, "../../data/character-assets");

function now(): string {
  return new Date().toISOString();
}

function sessionPath(sessionId: string): string {
  return join(SESSIONS_DIR, `${sessionId}.json`);
}

function assetDir(sessionId: string): string {
  return join(ASSETS_DIR, sessionId);
}

async function ensureDirs() {
  await mkdir(SESSIONS_DIR, { recursive: true });
  await mkdir(ASSETS_DIR, { recursive: true });
}

async function readSession(
  sessionId: string
): Promise<CharacterSessionFile | null> {
  const file = Bun.file(sessionPath(sessionId));
  if (!(await file.exists())) return null;
  return characterSessionFileSchema.parse(await file.json());
}

async function writeSession(sessionId: string, data: CharacterSessionFile) {
  await ensureDirs();
  await Bun.write(sessionPath(sessionId), JSON.stringify(data, null, 2));
}

async function getOrCreateSession(
  sessionId: string
): Promise<CharacterSessionFile> {
  const existing = await readSession(sessionId);
  if (existing) return existing;

  const created: CharacterSessionFile = {
    session: {
      id: sessionId,
      createdAt: now(),
      updatedAt: now(),
    },
    messages: [],
    assets: [],
  };
  await writeSession(sessionId, created);
  return created;
}

async function saveAsset(
  sessionId: string,
  params: {
    type: CharacterAssetType;
    providerUrl: string;
    toolName: string;
    width: number;
    height: number;
    prompt?: string;
    animationName?: string;
    frameIndex?: number;
  }
): Promise<CharacterAsset> {
  const dir = assetDir(sessionId);
  await mkdir(dir, { recursive: true });

  const assetId = crypto.randomUUID();
  const localPath = `${sessionId}/${assetId}.png`;
  const fullPath = join(ASSETS_DIR, localPath);

  // Download from provider URL or decode base64 data URI
  if (params.providerUrl.startsWith("data:")) {
    const base64 = params.providerUrl.split(",")[1];
    const buffer = Buffer.from(base64, "base64");
    await Bun.write(fullPath, buffer);
  } else {
    const response = await fetch(params.providerUrl);
    if (!response.ok) {
      throw new Error(
        `Failed to download asset: HTTP ${response.status}`
      );
    }
    const buffer = await response.arrayBuffer();
    await Bun.write(fullPath, buffer);
  }

  const asset: CharacterAsset = {
    id: assetId,
    sessionId,
    type: params.type,
    providerUrl: params.providerUrl,
    localPath,
    toolName: params.toolName,
    prompt: params.prompt,
    animationName: params.animationName,
    frameIndex: params.frameIndex,
    width: params.width,
    height: params.height,
    createdAt: now(),
  };

  // Append asset to session file
  const session = await getOrCreateSession(sessionId);
  session.assets.push(asset);
  session.session.updatedAt = now();
  await writeSession(sessionId, session);

  return asset;
}

async function updateMessages(
  sessionId: string,
  messages: unknown[]
): Promise<void> {
  const session = await getOrCreateSession(sessionId);
  session.messages = messages;
  session.session.updatedAt = now();
  await writeSession(sessionId, session);
}

export const characterSessionRepo = {
  readSession,
  writeSession,
  getOrCreateSession,
  saveAsset,
  updateMessages,
};
