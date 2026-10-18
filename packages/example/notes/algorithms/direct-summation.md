---
type: Concept
title: Direct summation
description: Every pair, every step: exact, and O(N²).
---

The accelerations from [Newton's law](/physics/newtons-law-of-gravitation.md "requires"), pair by pair, with [softening](/physics/softening.md "uses"):

```python
def accelerations(r, m, eps=0.01):
    d = r[None, :, :] - r[:, None, :]          # d[i, j] = r_j - r_i
    inv = (np.sum(d**2, axis=-1) + eps**2) ** -1.5
    np.fill_diagonal(inv, 0.0)
    return np.einsum("ij,ijk->ik", m[None, :] * inv, d)
```

The cost grows as $N^2$. Measured: about a second a step at $N = 2000$, and six or seven at $N = 5000$, with three $N \times N$ arrays in memory.

It is the reference: any faster method is checked against it.
