import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'

const MIN_WIDTH = 400
const MIN_HEIGHT = 300
const MAX_WIDTH = 800
const MAX_HEIGHT = 500
const WEBP_QUALITY = 80
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('image') as File | null

    if (!file) {
      return NextResponse.json(
        { error: 'No image file provided' },
        { status: 400 }
      )
    }

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload a JPEG, PNG, WebP, or GIF image.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 10MB.' },
        { status: 400 }
      )
    }

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const metadata = await sharp(buffer).metadata()

    if (!metadata.width || !metadata.height) {
      return NextResponse.json(
        { error: 'Could not read image dimensions.' },
        { status: 400 }
      )
    }

    if (metadata.width < MIN_WIDTH || metadata.height < MIN_HEIGHT) {
      return NextResponse.json(
        {
          error: `Image is too small (${metadata.width}x${metadata.height}px). Minimum size is ${MIN_WIDTH}x${MIN_HEIGHT}px — smaller images will look blurry.`
        },
        { status: 400 }
      )
    }

    const processedBuffer = await sharp(buffer)
      .resize(MAX_WIDTH, MAX_HEIGHT, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer()

    const base64 = processedBuffer.toString('base64')
    const dataUrl = `data:image/webp;base64,${base64}`

    return NextResponse.json({
      success: true,
      dataUrl,
      originalSize: file.size,
      processedSize: processedBuffer.length,
      originalDimensions: { width: metadata.width, height: metadata.height },
    })
  } catch (error) {
    console.error('Image processing error:', error)
    return NextResponse.json(
      { error: 'Failed to process image. Please try a different file.' },
      { status: 500 }
    )
  }
}
