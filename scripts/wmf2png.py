# -*- coding: utf-8 -*-
"""把 Word 公式 WMF 用 Windows GDI+ 栅格化为 PNG（纯 ctypes，不编译 .NET）。"""
import ctypes, os, glob, sys
from ctypes import wintypes

gp = ctypes.WinDLL("gdiplus")


class StartupInput(ctypes.Structure):
    _fields_ = [("GdiplusVersion", ctypes.c_uint32),
                ("DebugEventCallback", ctypes.c_void_p),
                ("SuppressBackgroundThread", ctypes.c_int),
                ("SuppressExternalCodecs", ctypes.c_int)]


class GUID(ctypes.Structure):
    _fields_ = [("Data1", ctypes.c_ulong), ("Data2", ctypes.c_ushort),
                ("Data3", ctypes.c_ushort), ("Data4", ctypes.c_ubyte * 8)]


si = StartupInput(1, None, 0, 0)
token = ctypes.c_ulong()
gp.GdiplusStartup.argtypes = [ctypes.POINTER(ctypes.c_ulong),
                              ctypes.POINTER(StartupInput), ctypes.c_void_p]
gp.GdiplusStartup.restype = ctypes.c_int
assert gp.GdiplusStartup(ctypes.byref(token), ctypes.byref(si), None) == 0, "GDI+ 启动失败"

gp.GdipLoadImageFromFile.argtypes = [wintypes.LPCWSTR, ctypes.POINTER(ctypes.c_void_p)]
gp.GdipLoadImageFromFile.restype = ctypes.c_int
gp.GdipGetImageWidth.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint)]
gp.GdipGetImageHeight.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_uint)]
gp.GdipCreateBitmapFromScan0.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_int,
                                          ctypes.c_int, ctypes.c_void_p,
                                          ctypes.POINTER(ctypes.c_void_p)]
gp.GdipGetImageGraphicsContext.argtypes = [ctypes.c_void_p, ctypes.POINTER(ctypes.c_void_p)]
gp.GdipGraphicsClear.argtypes = [ctypes.c_void_p, ctypes.c_uint32]
gp.GdipSetInterpolationMode.argtypes = [ctypes.c_void_p, ctypes.c_int]
gp.GdipDrawImageRectI.argtypes = [ctypes.c_void_p, ctypes.c_void_p,
                                  ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int]
gp.GdipSaveImageToFile.argtypes = [ctypes.c_void_p, wintypes.LPCWSTR,
                                   ctypes.POINTER(GUID), ctypes.c_void_p]
gp.GdipDeleteGraphics.argtypes = [ctypes.c_void_p]
gp.GdipDisposeImage.argtypes = [ctypes.c_void_p]

# PNG 编码器 CLSID {557CF406-1A04-11D3-9A73-0000F81EF32E}
PNG = GUID(0x557CF406, 0x1A04, 0x11D3,
           (ctypes.c_ubyte * 8)(0x9A, 0x73, 0x00, 0x00, 0xF8, 0x1E, 0xF3, 0x2E))
PixelFormat32bppARGB = 0x26200A


# WMF 头里的宽高是 1/100 mm；按 3 倍 96dpi 栅格化，约等于 A4 上 3 倍清晰度
DPI_SCALE = 96.0 / 2540.0 * 3


def convert(src):
    img = ctypes.c_void_p()
    st = gp.GdipLoadImageFromFile(os.path.abspath(src), ctypes.byref(img))
    if st != 0:
        raise RuntimeError("load %s failed GDI+ status %s" % (src, st))
    w, h = ctypes.c_uint(), ctypes.c_uint()
    gp.GdipGetImageWidth(img, ctypes.byref(w))
    gp.GdipGetImageHeight(img, ctypes.byref(h))
    W, H = max(8, int(w.value * DPI_SCALE)), max(8, int(h.value * DPI_SCALE))
    bmp = ctypes.c_void_p()
    st = gp.GdipCreateBitmapFromScan0(W, H, 0, PixelFormat32bppARGB, None, ctypes.byref(bmp))
    if st != 0:
        raise RuntimeError("bitmap failed %s" % st)
    g = ctypes.c_void_p()
    gp.GdipGetImageGraphicsContext(bmp, ctypes.byref(g))
    gp.GdipGraphicsClear(g, 0xFFFFFFFF)
    gp.GdipSetInterpolationMode(g, 7)          # HighQualityBicubic
    gp.GdipSetSmoothingMode(g, 4) if hasattr(gp, "GdipSetSmoothingMode") else None
    gp.GdipDrawImageRectI(g, img, 0, 0, W, H)
    dst = src[:-4] + ".png"
    st = gp.GdipSaveImageToFile(bmp, os.path.abspath(dst), ctypes.byref(PNG), None)
    gp.GdipDeleteGraphics(g)
    gp.GdipDisposeImage(bmp)
    gp.GdipDisposeImage(img)
    if st != 0:
        raise RuntimeError("save failed %s" % st)
    return w.value, h.value, W, H, os.path.getsize(dst)


if __name__ == "__main__":
    d = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "data", "record_media")
    for f in sorted(glob.glob(os.path.join(d, "*.wmf"))):
        try:
            r = convert(f)
            print("OK  %-34s %sx%s -> %sx%s  %s bytes" %
                  (os.path.basename(f), r[0], r[1], r[2], r[3], r[4]))
        except Exception as e:
            print("FAIL", os.path.basename(f), e)
    gp.GdiplusShutdown(token)
