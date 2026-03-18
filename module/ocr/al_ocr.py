import cv2
import numpy as np
from PIL import Image

from module.logger import logger

try:
    logger.info('Loading RapidOCR dependencies')
    from rapidocr_onnxruntime import RapidOCR
except Exception as e:
    logger.critical(f'Failed to load OCR dependencies: {e}')
    class RapidOCR:
        pass


class AlOcr:
    def __init__(
            self,
            *args,
            **kwargs,
    ):
        self._args = args
        self._kwargs = kwargs
        self._model_loaded = False
        self.engine = None
        self._cand_alphabet = None

    def init(self, *args, **kwargs):
        if not self._model_loaded:
            opt_kwargs = {'use_det': False, 'use_cls': False}
            
            # 自动探测并配置最强的硬件加速
            try:
                import onnxruntime as ort
                providers = ort.get_available_providers()
                if 'TensorrtExecutionProvider' in providers or 'CUDAExecutionProvider' in providers:
                    opt_kwargs['use_cuda'] = True
                    logger.info('RapidOCR: Supported GPU (CUDA/TensorRT) detected! Prioritizing GPU acceleration.')
                elif 'DmlExecutionProvider' in providers:
                    opt_kwargs['use_dml'] = True
                    logger.info('RapidOCR: DmlExecutionProvider detected! Prioritizing GPU/NPU (DirectML) acceleration.')
                else:
                    logger.info('RapidOCR: No specific hardware accelerator found. Falling back to CPU.')
            except Exception as e:
                logger.warning(f'RapidOCR hardware detection failed, playing safe with CPU: {e}')
                
            logger.info(f'Initializing RapidOCR model with args: {opt_kwargs}')
            self.engine = RapidOCR(**opt_kwargs)
            self._model_loaded = True

    def ocr(self, img_fp):
        if not self._model_loaded:
            self.init()

        if isinstance(img_fp, str):
            img = cv2.imread(img_fp)
        else:
            img = img_fp

        if len(img.shape) == 2:
            # RapidOCR usually performs better with black text on white background
            # AzurLaneAutoScript's pre_process outputs white text on black background, so we invert it
            img = cv2.bitwise_not(img)
            img = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)

        # 改良的 Padding：横向增加少量留白防止 W 等首字母幻觉
        # 纵向仅仅增加极小的留白，防止网络层 Resize 时纵向过度压缩导致符号（如冒号或数字尾巴）丢失和错位重复
        img = cv2.copyMakeBorder(
            img, 
            2, 2, 8, 8, 
            cv2.BORDER_CONSTANT, 
            value=(255, 255, 255)
        )

        res, _ = self.engine(img)
        if res is None or len(res) == 0:
            return []
        
        # When use_det=False, RapidOCR returns [['text', score], ...]
        results = []
        for r in res:
            text = r[0] if isinstance(r, (list, tuple)) else r
            if self._cand_alphabet:
                text = "".join(c for c in text if c in self._cand_alphabet)
            results.append(list(text))
        return results

    def ocr_for_single_line(self, img_fp):
        res = self.ocr(img_fp)
        if len(res) > 0:
            return res[0]
        return []

    def ocr_for_single_lines(self, img_list):
        return [self.ocr_for_single_line(img) for img in img_list]

    def set_cand_alphabet(self, cand_alphabet):
        if not self._model_loaded:
            self.init()
        self._cand_alphabet = cand_alphabet
        return self._cand_alphabet

    def atomic_ocr(self, img_fp, cand_alphabet=None):
        self.set_cand_alphabet(cand_alphabet)
        return self.ocr(img_fp)

    def atomic_ocr_for_single_line(self, img_fp, cand_alphabet=None):
        self.set_cand_alphabet(cand_alphabet)
        return self.ocr_for_single_line(img_fp)

    def atomic_ocr_for_single_lines(self, img_list, cand_alphabet=None):
        self.set_cand_alphabet(cand_alphabet)
        return self.ocr_for_single_lines(img_list)

    def debug(self, img_list):
        self.init()
        img_list_bgr = []
        for img in img_list:
            if len(img.shape) == 2:
                img_list_bgr.append(cv2.cvtColor(img, cv2.COLOR_GRAY2BGR))
            else:
                img_list_bgr.append(img)
        
        if not img_list_bgr:
            return
            
        # Pad images to same height before hconcat
        max_h = max(img.shape[0] for img in img_list_bgr)
        padded = []
        for img in img_list_bgr:
            pad_h = max_h - img.shape[0]
            if pad_h > 0:
                img = cv2.copyMakeBorder(img, 0, pad_h, 0, 0, cv2.BORDER_CONSTANT, value=[0, 0, 0])
            padded.append(img)
            
        image = cv2.hconcat(padded)
        Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB)).show()
