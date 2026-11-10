"""Reconstrucción de relieve de papeles plegados/arrugados a partir de fotos.
Modelo: la foto está iluminada desde arriba (medido en los perfiles de los pliegues).
Sombreado s = I/I_baja - 1  ≈  -k·(∇H·L)  (Lambert linealizado)  →  se invierte en Fourier.
La componente que esa luz no ve (pliegues paralelos a la luz) se completa con la oscuridad del surco
(los pliegues se ven como líneas oscuras: valle/oclusión)."""
import numpy as np
from scipy import ndimage
from PIL import Image

def shading(path, sig_low=55, sig_grain=1.0):
    a = np.asarray(Image.open(path).convert('L'), np.float32) / 255
    low = ndimage.gaussian_filter(a, sig_low, mode='reflect')
    s = a / np.maximum(low, 1e-3) - 1
    s = ndimage.gaussian_filter(s, sig_grain)
    return s

def reconstruct(s, L=(-0.12, -1.0), lam=0.35, groove=0.9, smooth=2e-3):
    h, w = s.shape
    # relleno con espejo para evitar costuras en Fourier
    sp = np.pad(s, ((h // 4, h // 4), (w // 4, w // 4)), mode='reflect')
    H0, W0 = sp.shape
    fy = np.fft.fftfreq(H0)[:, None] * 2 * np.pi
    fx = np.fft.fftfreq(W0)[None, :] * 2 * np.pi
    Ln = np.array(L) / np.hypot(*L)
    a = 1j * (fx * Ln[0] + fy * Ln[1])           # s = -(∇H·L) → S = -a·H̃
    I = np.fft.fft2(sp)
    # prior: oscuridad = surco (H ≈ groove·s a baja frecuencia)
    b = groove
    w2 = fx ** 2 + fy ** 2
    num = np.conj(-a) * I + lam * b * I * np.exp(-w2 / (2 * 0.35 ** 2))
    den = np.abs(a) ** 2 + lam + smooth * w2 * 0
    Hf = num / den
    Hf[0, 0] = 0
    H = np.real(np.fft.ifft2(Hf))[h // 4:h // 4 + h, w // 4:w // 4 + w]
    # quitar la deriva de muy baja frecuencia (curvaturas globales falsas)
    H = H - ndimage.gaussian_filter(H, 120, mode='reflect')
    return H

def relight(H, L):
    gy, gx = np.gradient(H)
    Ln = np.array(L) / np.hypot(*L)
    return -(gx * Ln[0] + gy * Ln[1])
