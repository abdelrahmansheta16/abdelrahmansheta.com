# Recording protocol — voice clone

Working checklist for the ElevenLabs voice clone, from `docs/ARCHITECTURE.md` section 5 and the week-1
bake-off protocol. Work top to bottom; do not skip the listening test.

Raw WAVs are archived **offline and encrypted**. They never enter this repo, the private corpus
repo, or any cloud drive that is not encrypted at rest with a key you hold.

---

## 0. Before you press record

- [ ] ElevenLabs account has **2FA on** and a **restricted API key** (Agents + TTS only).
- [ ] Two native-speaker judges named and a listening slot booked. Cairo-based preferred.
- [ ] The 12 listening-test sentences below reviewed and edited into your own words. They must
      still carry the ق and ج markers — that is the whole point of the test.
- [ ] Room prepared: small, soft furnishings, laptop fan off, phone on silent, notifications off.
- [ ] Mic: a $40–70 USB mic (Fifine / Samson Q2U class) at 20–25 cm, or the iPhone mic at the same
      distance, or record under a duvet if the room rings.
- [ ] Levels: **−23 to −18 dB RMS**, true peak **−3 dB**. Check on the first 30 seconds and stop if
      it clips.
- [ ] **Record 30 seconds of room tone** before the first take, and again if you change rooms.
- [ ] Same mic for the ElevenLabs voice-captcha verification later. A mismatch fails it, and a
      failure means a 24-hour lockout.

---

## 1. Instant clone — 2 to 3 minutes (Starter, $6)

Speak, do not read. If you catch yourself reading, stop and restart the sentence. Roughly 60%
Masri with English tech terms embedded, 40% English.

### Masri block (~2 min)

Talk through these as if a friend asked. The bracketed words must actually be said — they are the
phoneme markers the judges listen for.

1. **[قللنا]** How you cut LLM cost: "…الفكرة إننا **قللنا** التكلفة من غير ما نمس الجودة، وده كان
   أصعب جزء."
2. **[قبل]** What the system looked like before: "**قبل** كده كل حاجة كانت ماشية على سيرفر واحد."
3. **[جربت]** What you tried and threw away: "**جربت** أكتر من طريقة للـ routing لحد ما لقيت اللي
   بيظبط."
4. **[جامد]** The hardest part: "الـ voice pipeline ده كان تحدي **جامد** بصراحة."
5. **[جمعناها]** Where the numbers came from: "الأرقام دي **جمعناها** من الـ production مش من الورق."
6. **[القاهرة]** Where you sit and how the overlap works: "أنا في **القاهرة**، والفرق مع دبي ساعة بس."
7. **[قولي]** Invite the other side in: "**قولي** إنت عايز تعرف إيه بالظبط."

Code-switch naturally throughout: "عملت deploy للـ backend"، "بنينا الـ API بالـ FastAPI"،
"الـ LangGraph بيمسك التنسيق".

### English block (~1 min)

Interview register, relaxed, explaining to a colleague:

8. What you owned on the re-platform, end to end.
9. One trade-off you made and why you would make it again.
10. What you want from the next role, without naming a company.

- [ ] Trim long pauses and stacked fillers (**يعني**, "uhm") before uploading.
- [ ] Train the instant clone on **Flash v2.5 / Turbo v2.5 / Multilingual v2 only**. Never
      v3 Conversational — it does not preserve the clone identity.

---

## 2. Listening test — 12 sentences, three blind judges

Render the **same 12 sentences** three ways: IVC on Flash v2.5, IVC on v3 Conversational, and a
control ElevenLabs library Egyptian voice. Randomise the order. Judges on headphones, no labels.

### The script

| #   | Sentence                                                                                  | What it tests                    |
| --- | ----------------------------------------------------------------------------------------- | -------------------------------- |
| 1   | **قولي** بقى، إنت عايز تعرف إيه عن شغلي بالظبط؟                                           | ق → glottal stop                 |
| 2   | أنا قاعد في **القاهرة**، والفرق بينا وبين دبي ساعة واحدة بس.                              | ق in a place name                |
| 3   | إحنا **قللنا** تكلفة الـ LLM بنسبة سبعين في المية من غير ما نمس الجودة.                   | ق + numbers in words             |
| 4   | **قبل** كده كنت شغال على الـ backend لوحدي، وبعدين الفريق كبر.                            | ق + code-switch                  |
| 5   | **جربت** أكتر من طريقة للـ routing لحد ما لقيت اللي بيظبط.                                | ج → hard /g/                     |
| 6   | الـ voice pipeline ده كان تحدي **جامد**، بس طلع حلو.                                      | ج + English noun phrase          |
| 7   | الأرقام دي كلها **جمعناها** من الـ production مش من الورق.                                | ج in a verb                      |
| 8   | بنينا الـ API بالـ FastAPI، والموديل بتاع الرؤية كان YOLO، والتنسيق بينهم بـ LangGraph.   | code-switch intelligibility      |
| 9   | أول حاجة لازم أقولهالك: أنا نسخة ذكاء اصطناعي من عبدالرحمن، بصوته وبكلامه.                | the disclosure line              |
| 10  | أنا مفتوح لأي كلام لو في دور مناسب على الطاولة.                                           | the "open to conversations" line |
| 11  | I led the re-platform end to end — architecture, migration, and the team that shipped it. | English, Egyptian accent         |
| 12  | Happy to walk you through the trade-offs; ask me anything about the stack.                | English, conversational          |

### Scoring

Each judge scores every clip 1–5 on: dialect authenticity, phoneme markers (ق/ج), naturalness,
similarity to the real voice, code-switch intelligibility.

**Pass =** mean ≥ 3.5 on authenticity **and** similarity, ≥ 3.0 on everything else, and **≤ 2 of 12
clips with a fusha /q/**.

- [ ] Every mispronounced term goes into the alias dictionary (`glossary/pronunciation.yaml`) and,
      if the alias is not enough, into the curated `tashkeel.json`.
- [ ] Record the scores and the date in `docs/PROGRESS.md`.

**If the instant clone fails:** record more audio and train the Professional Voice Clone before
deciding anything. Only if the PVC also fails do you consider the labelled trade-off — a prebuilt
Egyptian library voice for Arabic, the clone for English.

---

## 3. Full PVC recording — 60 to 75 minutes

Only after the listening test passes. Buy Creator ($22, $11 the first month) and enable overage
billing before you start training.

**Mix:** ≈ 60% spontaneous Masri **with embedded English tech terms**, ≈ 40% English interview
register. **One** style throughout: relaxed, explaining to a colleague. ElevenLabs' minimum is 30
minutes, the optimum is 2–3 hours, and returns flatten past ~60 minutes for a single style.

Topics, roughly five minutes each, spoken not read:

- [ ] Cravit re-platform
- [ ] AI Branch Manager
- [ ] The 70% cost story
- [ ] The voice pipeline
- [ ] Rafeeq
- [ ] Nethermind / Puffer
- [ ] Style Protocol
- [ ] University, and how you got into engineering
- [ ] What you value in a team
- [ ] Logistics, said the way the twin would say them
- [ ] Opinions and hot takes
- [ ] A friend asking you 15 recruiter questions in Masri

Post-recording:

- [ ] Cut long pauses and stacked fillers.
- [ ] Confirm levels again across the whole session.
- [ ] Train the PVC. Complete the voice captcha **with the same mic**.
- [ ] Archive the raw WAVs offline, encrypted.
- [ ] Pin the resulting voice id in `ELEVENLABS_VOICE_ID` and re-run
      `pnpm push:agent --update <agent-id>`.
- [ ] Re-run the listening test on the PVC and record the delta in `docs/PROGRESS.md`.

---

## 4. STT smoke test

30 of your own utterances (15 Masri with tech English, 5 Gulf-accented, 10 UK/US English) plus 100
`Perle-ai/ASR_Code_Switch` clips through the Scribe v2 Realtime WebSocket.

**Pass =** normalised WER ≤ 20% and ≥ 80% of proper nouns recognised. Below that, evaluate
Speechmatics `ar_en` and Deepgram Nova-3 `ar-EG` behind the LiveKit escape hatch.
