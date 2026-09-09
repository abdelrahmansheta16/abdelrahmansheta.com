---
slug: voice-pipeline
name: "Example Voice Pipeline"
employer: "Fanous"
period: "2023 to 2024"
public_level: public
stack: ["Python", "FastAPI", "WebSockets", "Postgres"]
metrics:
  - {text: "Median round trip under one second on the internal benchmark", verified: true, public: true}
  - {text: "An internal number that stays internal", verified: true, public: false}
ui_section: projects
spoken_en: "A bilingual voice pipeline: speech in, a small router in the middle, speech back out in under a second."
spoken_ar: "باي بلاين صوتي بيفهم عربي وإنجليزي: كلام داخل، راوتر صغير في النص، وكلام راجع في أقل من ثانية."
---
A streaming voice path built on WebSockets: partial transcripts drive an early router, the router picks the
cheap model for small talk and the larger one for anything that touches data, and the reply is streamed back
sentence by sentence so the first word plays before the last one is generated. The interesting constraint was
back pressure: when the model is slower than speech, the pipeline drops its own partials rather than the
visitor's audio. Everything here is invented for the example corpus.
