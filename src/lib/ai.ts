import { supabase } from "@/lib/supabase";

/**
 * Успешный ответ от edge function
 */
export type EdgeOk<T> = {
  success: true;
  code: "OK" | string;
  message: null;
  data: T;
};

/**
 * Ошибка, возвращённая edge function (или нормализованная ошибка клиента)
 * ВАЖНО: это не exception. Это контролируемый результат.
 */
export type EdgeFail = {
  success: false;
  code:
    | "CREDITS_EXHAUSTED"
    | "RATE_LIMITED"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "BAD_REQUEST"
    | "NETWORK_ERROR"
    | "EDGE_NON_2XX"
    | "EDGE_ERROR"
    | "UNKNOWN_ERROR"
    | string;
  message: string;
  status?: number; // если известен HTTP статус
  details?: unknown; // что-то полезное для дебага
};

export type EdgeResult<T> = EdgeOk<T> | EdgeFail;

type InvokeOptions = {
  functionName: string;
  body?: Record<string, unknown>;
  // если хочешь — можно будет добавить headers позже
};

function asString(x: unknown): string {
  if (typeof x === "string") return x;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

/**
 * Пытаемся вытащить статус из supabase.functions.invoke error.
 * (Supabase иногда прячет статус внутри error/context)
 */
function extractStatus(err: any): number | undefined {
  return (
    err?.status ??
    err?.context?.status ??
    err?.context?.response?.status ??
    err?.response?.status ??
    undefined
  );
}

/**
 * Маппим частые статусы/сообщения в удобные коды.
 */
function normalizeErrorCode(err: any, status?: number): EdgeFail["code"] {
  const msg = (err?.message ?? err?.error_description ?? "").toString().toLowerCase();

  if (status === 402 || msg.includes("insufficient") || msg.includes("credit")) return "CREDITS_EXHAUSTED";
  if (status === 429 || msg.includes("rate") || msg.includes("too many")) return "RATE_LIMITED";
  if (status === 401 || msg.includes("unauthorized")) return "UNAUTHORIZED";
  if (status === 403 || msg.includes("forbidden")) return "FORBIDDEN";
  if (status === 400 || msg.includes("bad request")) return "BAD_REQUEST";
  if (msg.includes("network") || msg.includes("failed to fetch")) return "NETWORK_ERROR";

  if (typeof status === "number" && status >= 400) return "EDGE_NON_2XX";
  return "EDGE_ERROR";
}

/**
 * Главная функция вызова edge function.
 * Она НИКОГДА не throw-ит для ожидаемых ошибок, а возвращает EdgeFail.
 */
export async function invokeEdge<T>(opts: InvokeOptions): Promise<EdgeResult<T>> {
  try {
    const { data, error } = await supabase.functions.invoke(opts.functionName, {
      body: opts.body ?? {},
    });

    // 1) Если Supabase вернул ошибку — нормализуем и возвращаем EdgeFail
    if (error) {
      const status = extractStatus(error);
      const code = normalizeErrorCode(error, status);
      return {
        success: false,
        code,
        message: error.message ?? "Edge function error",
        status,
        details: error,
      };
    }

    // 2) Если data уже в нашем формате success:false/true — просто возвращаем
    // (идеальный мир: edge всегда отдаёт 200 и structured payload)
    if (data && typeof data === "object" && "success" in (data as any)) {
      return data as EdgeResult<T>;
    }

    // 3) Если edge вернул "просто данные" без оболочки — оборачиваем в OK
    return {
      success: true,
      code: "OK",
      message: null,
      data: data as T,
    };
  } catch (e: any) {
    // 4) Любые неожиданные исключения (например, сеть) — тоже в EdgeFail
    const status = extractStatus(e);
    const code = normalizeErrorCode(e, status);
    return {
      success: false,
      code,
      message: e?.message ? String(e.message) : "Unknown error",
      status,
      details: e,
    };
  }
}

/**
 * Удобный helper: превращает EdgeFail в читаемую строку для UI.
 */
export function edgeFailToHuman(err: EdgeFail): string {
  switch (err.code) {
    case "CREDITS_EXHAUSTED":
      return "AI временно недоступен: закончились кредиты.";
    case "RATE_LIMITED":
      return "AI временно перегружен. Попробуй позже.";
    case "UNAUTHORIZED":
      return "Нет доступа (401). Проверь ключи/авторизацию.";
    case "FORBIDDEN":
      return "Доступ запрещён (403). Проверь политики/права.";
    case "NETWORK_ERROR":
      return "Проблема с сетью. Проверь интернет и попробуй снова.";
    default:
      return err.message || "Произошла ошибка.";
  }
}

/* ----------------------------
   Дальше — конкретные вызовы.
   Подстрой имена функций под твой проект.
----------------------------- */

export type TranslateResponse = {
  translated_text: string;
  language: string;
};

export async function translateText(params: {
  text: string;
  from: string; // "RU" | "DE" | "EN" etc
  to: string;
  material_id?: string;
}): Promise<EdgeResult<TranslateResponse>> {
  return invokeEdge<TranslateResponse>({
    functionName: "translate-text",
    body: {
      text: params.text,
      from: params.from,
      to: params.to,
      material_id: params.material_id ?? null,
    },
  });
}

export type QuizQuestion = {
  question: string;
  options: string[];
  answerIndex?: number; // если у тебя есть
  explanation?: string;
};

export type QuizResponse = {
  questions: QuizQuestion[];
};

export async function generateQuiz(params: {
  material_id: string;
  ocr_text: string;
  language: string; // "de" | "en" etc
  count?: number;
}): Promise<EdgeResult<QuizResponse>> {
  return invokeEdge<QuizResponse>({
    functionName: "generate-quiz",
    body: {
      material_id: params.material_id,
      ocr_text: params.ocr_text,
      language: params.language,
      count: params.count ?? 8,
    },
  });
}
