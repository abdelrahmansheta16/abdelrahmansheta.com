---
claim: "Most agent frameworks are a queue and a retry policy wearing a costume"
why: "The hard parts are idempotency, budgets and human approval, and a framework owns none of them."
nuance: "For a demo the framework saves a week. For a system that spends money it costs a quarter."
spoken_ar: "أغلب الـ agent frameworks في الآخر عبارة عن queue وretry policy. الجزء الصعب هو الـ idempotency والبودجت وموافقة البني آدم."
---
The parts that break in production are the parts a framework does not own: what happens when the same step
runs twice, who approves an action that spends money, and what the thing does when it runs out of budget in
the middle of a plan. A queue, a state table and a human in the loop will carry a system further than a
graph abstraction will.
