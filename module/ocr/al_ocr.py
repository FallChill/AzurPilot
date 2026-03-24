import os
import gc
import numpy as np
import cv2
from PIL import Image

from module.exception import RequestHumanTakeover
from module.logger import logger
from module.config.config import AzurLaneConfig

try:
    from rapidocr import RapidOCR, OCRVersion
except Exception as e:
    logger.critical(f'Failed to load OCR dependencies: {e}')
    logger.critical('无法加载 OCR 依赖，如错误信息包含 DLL load failed while 请安装微软 C++ 运行库 https://aka.ms/vs/17/release/vc_redist.x64.exe')
    raise RequestHumanTakeover

USE_GPU = False
config_name = os.environ.get('ALAS_CONFIG_NAME')
if config_name:
    config = AzurLaneConfig(config_name)
    val = config.Optimization_UseOcrGpuAcceleration
    if val is False:
        logger.info(f'OCR GPU acceleration disabled by config/{config_name}.json')
        USE_GPU = False
    else:
        USE_GPU = True

# GC 调优：降低垃圾回收阈值，更积极地回收短生命周期对象
_gc_threshold = gc.get_threshold()
gc.set_threshold(500, 5, 5)
logger.info(f'GC threshold adjusted: {_gc_threshold} -> {gc.get_threshold()}')

# OCR 推理批量 GC 间隔（每处理多少张图触发一次 GC）
_GC_INTERVAL = 50

class CnModel:
    """中文 OCR 模型，懒加载以避免未使用时占用内存"""
    def __init__(self):
        self.params = {
            "Global.use_det": False,
            "Global.use_cls": False,
            "Det.model_path": None,
            "Cls.model_path": None,
            "Rec.ocr_version": OCRVersion.PPOCRV5,
            "Rec.model_path": "bin/ocr_models/zh-CN/alocr-zh-cn-v2.5.dtk.onnx",
            "Rec.rec_keys_path": "bin/ocr_models/zh-CN/cn.txt",
            "EngineConfig.onnxruntime.use_dml": USE_GPU
        }
        self._model = None

    @property
    def model(self):
        if self._model is None:
            logger.info('Lazy loading CnModel...')
            self._model = RapidOCR(params=self.params)
        return self._model

    def release(self):
        """释放模型占用的内存"""
        if self._model is not None:
            del self._model
            self._model = None
            gc.collect()
            logger.info('CnModel released')

class EnModel:
    """英文 OCR 模型，懒加载以避免未使用时占用内存"""
    def __init__(self):
        self.params = {
            "Global.use_det": False,
            "Global.use_cls": False,
            "Det.model_path": None,
            "Cls.model_path": None,
            "Rec.ocr_version": OCRVersion.PPOCRV4,
            "Rec.model_path": "bin/ocr_models/en-US/alocr-en-us-v2.0.nvc.onnx",
            "Rec.rec_keys_path": "bin/ocr_models/en-US/en.txt",
            "EngineConfig.onnxruntime.use_dml": USE_GPU
        }
        self._model = None

    @property
    def model(self):
        if self._model is None:
            logger.info('Lazy loading EnModel...')
            self._model = RapidOCR(params=self.params)
        return self._model

    def release(self):
        """释放模型占用的内存"""
        if self._model is not None:
            del self._model
            self._model = None
            gc.collect()
            logger.info('EnModel released')

cn_model = CnModel()
en_model = EnModel()

class AlOcr:
    def __init__(self, **kwargs):
        self.model = None
        self.name = kwargs.get('name', 'en')
        self.params = {}
        self._model_loaded = False
        logger.info(f"Created AlOcr instance: name='{self.name}', kwargs={kwargs}, PID={os.getpid()}")

    def init(self):
        if self.name in ['cn', 'zhcn']:
            self.model = cn_model.model
        else:
            self.model = en_model.model
        self._model_loaded = True

    def _ensure_loaded(self):
        if not self._model_loaded:
            self.init()

    def ocr(self, img_fp):
        logger.info(f"[VERBOSE] AlOcr.ocr: Ensure loaded...")
        self._ensure_loaded()

        res = None
        try:
            res = self.model(img_fp)
            if hasattr(res, 'txts') and res.txts:
                text = res.txts[0]
            else:
                text = ""
            return text
        except Exception as e:
            logger.error(f"AlOcr.ocr exception: {e}")
            raise
        finally:
            del res
            gc.collect(0)

    def ocr_for_single_line(self, img_fp):
        return self.ocr(img_fp)

    def ocr_for_single_lines(self, img_list):
        self._ensure_loaded()
        results = []
        for i, img in enumerate(img_list):
            res = None
            try:
                res = self.model(img)
                if hasattr(res, 'txts') and res.txts:
                    results.append(res.txts[0])
                else:
                    results.append("")
            except Exception as e:
                logger.error(f"AlOcr.ocr_for_single_lines exception on image {i}: {e}")
                raise
            finally:
                del res
                if (i + 1) % _GC_INTERVAL == 0:
                    gc.collect(0)
        gc.collect()
        return results

    def set_cand_alphabet(self, cand_alphabet):
        pass

    def atomic_ocr(self, img_fp, cand_alphabet=None):
        res = self.ocr(img_fp)
        if cand_alphabet:
            res = ''.join([c for c in res if c in cand_alphabet])
        return res

    def atomic_ocr_for_single_line(self, img_fp, cand_alphabet=None):
        res = self.ocr_for_single_line(img_fp)
        if cand_alphabet:
            res = ''.join([c for c in res if c in cand_alphabet])
        return res

    def atomic_ocr_for_single_lines(self, img_list, cand_alphabet=None):
        results = self.ocr_for_single_lines(img_list)
        if cand_alphabet:
            results = [''.join([c for c in res if c in cand_alphabet]) for res in results]
        return results

    def cleanup(self):
        """手动释放模型引用，用于需要回收内存时调用"""
        self.model = None
        self._model_loaded = False
        gc.collect()
        logger.info(f"AlOcr instance '{self.name}' cleaned up, GC collected")