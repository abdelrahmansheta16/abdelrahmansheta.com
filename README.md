# abdelrahmansheta.com

A portfolio site whose only living element is a voice agent in my own cloned voice, speaking Egyptian
Arabic and English, grounded in my CV and project notes, that cannot leak my phone number even if the
model wants to, and runs for under $30 a month. This README becomes the case study; see `docs/ARCHITECTURE.md`
for the design and `docs/PROGRESS.md` for what shipped.

Run it with a fake person: `cp -r knowledge.example ../my-corpus && KNOWLEDGE_DIR=../my-corpus pnpm dev`.
