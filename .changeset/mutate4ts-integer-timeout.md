---
"mutate4ts": patch
---

Fix every mutant erroring when the baseline run takes more than 5 s. The mutant timeout is now
rounded up to an integer, because Bun rejects a fractional `timeout`. The report now prints the
message of each errored mutant, once per distinct message, so an all-error run says why.
