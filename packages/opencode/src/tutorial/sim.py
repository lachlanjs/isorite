import numpy as np

# Two bodies of mass 1/2, 1 apart, each circling the centre of mass at 1/2 (G = 1): the period is 2π.
m = np.array([0.5, 0.5])
r = np.array([[-0.5, 0.0], [0.5, 0.0]])
v = np.array([[0.0, -0.5], [0.0, 0.5]])
dt, steps = 2 * np.pi / 100, 10_000


def accelerations(r, m):
    d = r[None, :, :] - r[:, None, :]  # d[i, j] = r_j - r_i
    d2 = np.sum(d**2, axis=-1)
    np.fill_diagonal(d2, 1.0)
    inv = d2**-1.5
    np.fill_diagonal(inv, 0.0)
    return np.einsum("ij,ijk->ik", m[None, :] * inv, d)


def energy(r, v, m):
    return 0.5 * np.sum(m * np.sum(v**2, axis=1)) - m[0] * m[1] / np.linalg.norm(r[0] - r[1])


a, e0 = accelerations(r, m), energy(r, v, m)
for step in range(steps):
    v += 0.5 * dt * a  # kick
    r += dt * v  # drift
    a = accelerations(r, m)
    v += 0.5 * dt * a  # kick
print(f"energy drift after {steps * dt / (2 * np.pi):.0f} orbits: {abs(energy(r, v, m) - e0) / abs(e0):.1e}")
