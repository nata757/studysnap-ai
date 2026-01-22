
# StudySnap MVP - План реализации

## Обзор проекта

**StudySnap** - мобильное PWA приложение для студентов-медиков. Пользователь фотографирует конспекты/слайды, получает распознанный текст (OCR через Gemini), затем AI генерирует конспект, флеш-карточки и тест. Встроена система интервального повторения.

---

## Технический стек

| Компонент | Технология |
|-----------|------------|
| Frontend | React + TypeScript + Tailwind CSS |
| Платформа | PWA (установка на телефон) |
| Backend | Supabase (Auth, Database, Storage, Edge Functions) |
| OCR | Google Gemini Vision API (через Lovable AI Gateway) |
| AI генерация | OpenAI GPT через Lovable AI Gateway |
| State | React Context + React Query |

---

## Архитектура приложения

```text
src/
├── components/
│   ├── ui/                    # Существующие shadcn компоненты
│   ├── layout/
│   │   ├── AppLayout.tsx      # Основной layout с навигацией
│   │   ├── BottomNav.tsx      # Мобильная навигация
│   │   └── Header.tsx
│   ├── auth/
│   │   ├── AuthGuard.tsx      # Защита роутов
│   │   └── LoginForm.tsx
│   ├── materials/
│   │   ├── MaterialCard.tsx   # Карточка материала в списке
│   │   ├── ImageCapture.tsx   # Камера/галерея
│   │   ├── ImageCropper.tsx   # Обрезка изображений
│   │   ├── OcrPreview.tsx     # Предпросмотр OCR текста
│   │   └── TopicSelector.tsx  # Выбор темы
│   ├── ai/
│   │   ├── SummaryView.tsx    # Отображение конспекта
│   │   ├── FlashcardView.tsx  # Флеш-карточка
│   │   ├── QuizView.tsx       # Тест
│   │   └── ConfidenceBadge.tsx
│   └── review/
│       ├── ReviewCard.tsx     # Карточка повторения
│       └── ReviewProgress.tsx
├── pages/
│   ├── Index.tsx              # Домашний экран
│   ├── Auth.tsx               # Логин/регистрация
│   ├── AddMaterial.tsx        # Добавление материала (multi-step)
│   ├── MaterialDetail.tsx     # Детали материала
│   ├── Review.tsx             # Повторение
│   └── Search.tsx             # Поиск
├── hooks/
│   ├── useAuth.tsx            # Аутентификация
│   ├── useMaterials.tsx       # CRUD материалов
│   ├── useOcr.tsx             # OCR обработка
│   ├── useAiGeneration.tsx    # AI генерация
│   └── useSpacedRepetition.tsx
├── lib/
│   ├── supabase.ts            # Supabase клиент
│   ├── types.ts               # TypeScript типы
│   └── constants.ts           # Темы, константы
├── contexts/
│   └── AuthContext.tsx
└── i18n/
    ├── locales/
    │   ├── ru.json
    │   ├── de.json
    │   └── en.json
    └── index.ts
```

---

## Схема базы данных (Supabase)

### Таблицы

**profiles**
```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  language TEXT DEFAULT 'ru',
  exam_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**materials**
```sql
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  title TEXT,
  topic TEXT NOT NULL, -- Anatomie, Hygiene, Pflegepraxis, etc.
  tags TEXT[],
  ocr_text TEXT,
  notes TEXT,
  images TEXT[], -- Storage URLs
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**summaries**
```sql
CREATE TABLE summaries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
  short_summary TEXT,
  medium_summary TEXT,
  long_summary TEXT,
  warnings TEXT[],
  generated_at TIMESTAMPTZ DEFAULT now()
);
```

**flashcards**
```sql
CREATE TABLE flashcards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  confidence TEXT DEFAULT 'medium', -- high, medium, low
  stage INTEGER DEFAULT 0, -- 0-3 для spaced repetition
  due_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

**quiz_questions**
```sql
CREATE TABLE quiz_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL, -- ["A", "B", "C", "D"]
  correct_index INTEGER NOT NULL,
  explanation TEXT,
  confidence TEXT DEFAULT 'medium',
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS политики
- Все таблицы защищены RLS
- Пользователи видят только свои данные
- Полная изоляция данных между пользователями

---

## Edge Functions

### 1. process-ocr
**Назначение**: Распознавание текста через Gemini Vision

```typescript
// POST /functions/v1/process-ocr
// Body: { imageBase64: string }
// Response: { text: string, confidence: "high" | "medium" | "low" }
```

### 2. generate-summary
**Назначение**: Генерация конспекта в 3 уровнях

```typescript
// POST /functions/v1/generate-summary
// Body: { ocrText: string, notes?: string, topic: string }
// Response: { short, medium, long, warnings[] }
```

### 3. generate-flashcards
**Назначение**: Генерация флеш-карточек

```typescript
// POST /functions/v1/generate-flashcards
// Body: { ocrText: string, notes?: string, topic: string, count: number }
// Response: { flashcards: [{q, a, confidence}], warnings[] }
```

### 4. generate-quiz
**Назначение**: Генерация теста

```typescript
// POST /functions/v1/generate-quiz
// Body: { ocrText: string, notes?: string, topic: string, count: number }
// Response: { quiz: [{question, options[], correctIndex, explanation, confidence}], warnings[] }
```

---

## Экраны приложения

### A. Домашний экран (Index)
- Блок "Сегодня повторить: N карточек" с кнопкой перехода
- Кнопка "+ Добавить материал"
- Список последних материалов (карточки)
- Нижняя навигация: Главная | Поиск | Повторить | Профиль

### B. Добавление материала (AddMaterial)
**Step 1**: Выбор/съёмка фото
- Кнопки "Камера" и "Галерея"
- Превью выбранных изображений (multi-select)
- Возможность удаления/переупорядочивания

**Step 2**: OCR и редактирование
- Прогресс обработки
- Показ распознанного текста
- Редактируемое текстовое поле
- Кнопка "Далее"

**Step 3**: Метаданные
- Выбор темы (dropdown)
- Теги (input с chips)
- Заголовок (опционально)
- Кнопка "Сохранить"

### C. Детали материала (MaterialDetail)
**Табы**: Фото | Текст | Конспект | Карточки | Тест

**Секция "Фото"**:
- Галерея изображений

**Секция "Текст"**:
- OCR текст (редактируемый)

**Секция "Конспект"**:
- Кнопка "Сгенерировать" если нет
- Переключатель short/medium/long
- Кнопка "Экспорт в PDF"

**Секция "Карточки"**:
- Кнопка "Сгенерировать (15)"
- Список карточек с Q/A
- Badges confidence

**Секция "Тест"**:
- Кнопка "Сгенерировать (8)"
- Интерактивный тест
- Результаты

### D. Повторение (Review)
- Счётчик: "Осталось: X карточек"
- Карточка вопрос (flip для ответа)
- Кнопки "Знал" / "Не знал"
- Прогресс-бар

### E. Поиск (Search)
- Строка поиска
- Фильтр по теме (chips)
- Результаты

### F. Аутентификация (Auth)
- Табы: Вход | Регистрация
- Email + пароль
- Google OAuth (опционально)

---

## Алгоритм Spaced Repetition

```text
stage 0: +1 день (если "знал") / остаётся 0 (если "не знал")
stage 1: +2 дня
stage 2: +4 дня
stage 3: +7 дней (максимум)

"Не знал" → stage = 0, due_date = завтра
```

---

## AI Промпты

### Системный промпт (общий)
```text
Ты — ассистент для подготовки к медицинским экзаменам.
ПРАВИЛА:
1. НЕ добавляй факты, которых нет в исходном тексте
2. Если не уверен — используй confidence="low" и добавь "необходимо уточнить"
3. Пиши кратко, структурировано, пригодно для экзамена
4. Отвечай ТОЛЬКО JSON по заданной схеме, без лишнего текста
```

### JSON схемы

**Summary**:
```json
{
  "short": "2-3 предложения",
  "medium": "1-2 абзаца",
  "long": "полный структурированный конспект",
  "warnings": ["список предупреждений"]
}
```

**Flashcards**:
```json
{
  "flashcards": [
    {"q": "вопрос", "a": "ответ", "confidence": "high|medium|low"}
  ],
  "warnings": []
}
```

**Quiz**:
```json
{
  "quiz": [
    {
      "question": "текст",
      "options": ["A", "B", "C", "D"],
      "correctIndex": 0,
      "explanation": "объяснение",
      "confidence": "high|medium|low"
    }
  ],
  "warnings": []
}
```

---

## PWA конфигурация

- Manifest.json с иконками
- Service Worker для офлайн-кэширования
- Установка на домашний экран
- Тёмная тема (автоматически по системе)

---

## Безопасность и приватность

1. **Privacy hint** при загрузке фото:
   - Предупреждение о персональных данных
   - Инструмент обрезки (crop) перед сохранением

2. **Confidence badges**:
   - Визуальная индикация уверенности AI
   - Предупреждения для low confidence

3. **Input validation**:
   - Zod схемы для всех форм
   - Валидация на клиенте и сервере

---

## План реализации (фазы)

### Фаза 1: Основа
1. Настройка Supabase (миграции, RLS)
2. Аутентификация (email/password)
3. PWA конфигурация
4. Базовый layout и навигация

### Фаза 2: Материалы
5. Захват изображений (камера/галерея)
6. Обрезка изображений
7. OCR через Gemini
8. Сохранение материалов

### Фаза 3: AI генерация
9. Edge functions для AI
10. Генерация конспектов
11. Генерация карточек
12. Генерация тестов

### Фаза 4: Повторение
13. Spaced repetition логика
14. Экран повторения
15. Статистика

### Фаза 5: Поиск и экспорт
16. Поиск материалов
17. Экспорт в PDF/текст
18. Локализация (RU/DE/EN)

---

## Улучшения после MVP

- Google OAuth
- Синхронизация между устройствами (уже есть через Supabase)
- Push-уведомления для повторения
- Статистика и графики прогресса
- Распознавание рукописного текста
- Групповые учебные сессии
- Интеграция с календарём экзаменов

---

## Зависимости для установки

```json
{
  "vite-plugin-pwa": "для PWA",
  "react-cropper": "для обрезки изображений",
  "react-camera-pro": "для камеры (опционально, можно input)",
  "jspdf": "для экспорта PDF",
  "i18next": "для локализации"
}
```

---

## Готовность к реализации

После утверждения плана я создам:
1. Все Supabase миграции
2. Edge Functions для OCR и AI
3. Компоненты UI
4. Страницы приложения
5. PWA конфигурацию
6. Локализацию

Приложение будет полностью рабочим и готовым к тестированию.
