use wasm_bindgen::prelude::*;
use jxl::api::*;
use jxl::image::{Image, Rect};

#[wasm_bindgen]
pub struct JxlInfo {
    pub width: u32,
    pub height: u32,
    pub num_frames: usize,
    pub has_alpha: bool,
}

/// Decode a JXL image to PNG (or APNG if animated)
#[wasm_bindgen]
pub fn decode_jxl_to_png(data: &[u8]) -> Result<Vec<u8>, JsValue> {
    console_error_panic_hook::set_once();
    
    if data.len() < 2 {
        return Err(JsValue::from_str("Input too small to be a JXL file"));
    }
    
    let options = JxlDecoderOptions::default();
    let decoder = JxlDecoder::new(options);
    let mut input = data;

    // Advance to image info
    let mut dec = decoder;
    let decoder_with_info = loop {
        match dec.process(&mut input) {
            Ok(ProcessingResult::Complete { result }) => break result,
            Ok(ProcessingResult::NeedsMoreInput { fallback, .. }) => {
                if input.is_empty() {
                    return Err(JsValue::from_str("Incomplete JXL data (header)"));
                }
                dec = fallback;
            }
            Err(e) => return Err(JsValue::from_str(&format!("JXL header error: {}", e))),
        }
    };
    
    let basic_info = decoder_with_info.basic_info().clone();
    let (width, height) = basic_info.size;
    
    if width == 0 || height == 0 {
        return Err(JsValue::from_str("Invalid image dimensions"));
    }
    
    // Check if animated
    let is_animated = basic_info.animation.is_some();
    let animation_info = basic_info.animation.clone();
    
    // Build pixel format
    let num_extra_channels = basic_info.extra_channels.len();
    let pixel_format = JxlPixelFormat {
        color_type: JxlColorType::Rgba,
        color_data_format: Some(JxlDataFormat::U8 { bit_depth: 8 }),
        extra_channel_format: vec![None; num_extra_channels],
    };
    
    let mut decoder_with_info = decoder_with_info;
    decoder_with_info.set_pixel_format(pixel_format);
    
    // Collect all frames
    let mut frames: Vec<(Vec<u8>, u32)> = Vec::new(); // (pixels, delay_ms)
    let stride = width * 4;
    
    let mut current_decoder = decoder_with_info;
    
    loop {
        // Advance to frame info
        let decoder_with_frame = loop {
            match current_decoder.process(&mut input) {
                Ok(ProcessingResult::Complete { result }) => break result,
                Ok(ProcessingResult::NeedsMoreInput { fallback, .. }) => {
                    if input.is_empty() {
                        return Err(JsValue::from_str("Incomplete JXL data (frame info)"));
                    }
                    current_decoder = fallback;
                }
                Err(e) => return Err(JsValue::from_str(&format!("JXL frame info error: {}", e))),
            }
        };
        
        // Get frame duration if animated
        let frame_header = decoder_with_frame.frame_header();
        let delay_ms = if let Some(ref anim) = animation_info {
            // duration is in ticks, convert to ms
            // tps = ticks per second = tps_numerator / tps_denominator
            let tps = anim.tps_numerator as f64 / anim.tps_denominator as f64;
            let duration_ticks = frame_header.duration.unwrap_or(1.0);
            ((duration_ticks / tps) * 1000.0) as u32
        } else {
            0
        };
        
        // Allocate and decode frame
        let mut image_buffer = Image::<u8>::new((stride, height))
            .map_err(|e| JsValue::from_str(&format!("Buffer alloc failed: {}", e)))?;
        
        {
            let rect = Rect {
                origin: (0, 0),
                size: (stride, height),
            };
            
            let mut buffers = vec![JxlOutputBuffer::from_image_rect_mut(
                image_buffer.get_rect_mut(rect).into_raw()
            )];
            
            let mut dec3 = decoder_with_frame;
            loop {
                match dec3.process(&mut input, &mut buffers) {
                    Ok(ProcessingResult::Complete { result }) => {
                        current_decoder = result;
                        break;
                    }
                    Ok(ProcessingResult::NeedsMoreInput { fallback, .. }) => {
                        if input.is_empty() {
                            return Err(JsValue::from_str("Incomplete JXL data (pixels)"));
                        }
                        dec3 = fallback;
                    }
                    Err(e) => return Err(JsValue::from_str(&format!("JXL decode error: {}", e))),
                }
            }
        }
        
        // Flatten to contiguous buffer
        let mut flat_pixels = Vec::with_capacity(stride * height);
        for y in 0..height {
            flat_pixels.extend_from_slice(image_buffer.row(y));
        }
        
        frames.push((flat_pixels, delay_ms.max(10))); // min 10ms delay
        
        // Check for more frames
        if !current_decoder.has_more_frames() {
            break;
        }
    }
    
    // Encode output
    if frames.len() == 1 || !is_animated {
        // Static PNG
        encode_static_png(width, height, &frames[0].0)
    } else {
        // Animated PNG (APNG)
        encode_apng(width, height, &frames)
    }
}

fn encode_static_png(width: usize, height: usize, pixels: &[u8]) -> Result<Vec<u8>, JsValue> {
    use image::ImageEncoder;
    
    let mut png_data = Vec::new();
    let encoder = image::codecs::png::PngEncoder::new(&mut png_data);
    encoder.write_image(
        pixels,
        width as u32,
        height as u32,
        image::ColorType::Rgba8
    ).map_err(|e| JsValue::from_str(&format!("PNG encode error: {}", e)))?;
    
    Ok(png_data)
}

fn encode_apng(width: usize, height: usize, frames: &[(Vec<u8>, u32)]) -> Result<Vec<u8>, JsValue> {
    let mut output = Vec::new();
    
    {
        let mut encoder = png::Encoder::new(&mut output, width as u32, height as u32);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        encoder.set_animated(frames.len() as u32, 0).map_err(|e| JsValue::from_str(&format!("APNG setup error: {}", e)))?;
        
        let mut writer = encoder.write_header().map_err(|e| JsValue::from_str(&format!("PNG header error: {}", e)))?;
        
        for (i, (pixels, delay_ms)) in frames.iter().enumerate() {
            // Set frame delay: delay_ms milliseconds = delay_ms/1000 seconds
            // png crate uses num/den format
            writer.set_frame_delay(*delay_ms as u16, 1000).map_err(|e| JsValue::from_str(&format!("Frame delay error: {}", e)))?;
            
            writer.write_image_data(pixels).map_err(|e| JsValue::from_str(&format!("Frame {} write error: {}", i, e)))?;
        }
        
        writer.finish().map_err(|e| JsValue::from_str(&format!("APNG finish error: {}", e)))?;
    }
    
    Ok(output)
}

#[wasm_bindgen]
pub fn get_jxl_info(data: &[u8]) -> Result<JxlInfo, JsValue> {
    console_error_panic_hook::set_once();
    
    if data.len() < 2 {
        return Err(JsValue::from_str("Input too small"));
    }
    
    let options = JxlDecoderOptions::default();
    let decoder = JxlDecoder::new(options);
    let mut input = data;

    let mut dec = decoder;
    let decoder_with_info = loop {
        match dec.process(&mut input) {
            Ok(ProcessingResult::Complete { result }) => break result,
            Ok(ProcessingResult::NeedsMoreInput { fallback, .. }) => {
                if input.is_empty() {
                    return Err(JsValue::from_str("Incomplete JXL data"));
                }
                dec = fallback;
            }
            Err(e) => return Err(JsValue::from_str(&format!("JXL parse error: {}", e))),
        }
    };
    
    let info = decoder_with_info.basic_info();
    let has_alpha = !info.extra_channels.is_empty();
    let num_frames = if info.animation.is_some() { 2 } else { 1 }; // Approximate
    
    Ok(JxlInfo {
        width: info.size.0 as u32,
        height: info.size.1 as u32,
        num_frames,
        has_alpha,
    })
}
