'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useState, useEffect, useCallback } from 'react'
import styles from './RichTextEditor.module.css'

interface RichTextEditorProps {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
      Placeholder.configure({
        placeholder: placeholder || 'Start writing...',
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: 'tiptap',
      },
    },
  })

  // Sync external value changes (e.g. edit mode loading)
  useEffect(() => {
    if (editor && value && editor.getHTML() !== value) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
  }, [value, editor])

  const setLink = useCallback(() => {
    if (!editor || !linkUrl) return
    const url = linkUrl.startsWith('http') ? linkUrl : `https://${linkUrl}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
    setLinkUrl('')
    setShowLinkInput(false)
  }, [editor, linkUrl])

  const removeLink = useCallback(() => {
    if (!editor) return
    editor.chain().focus().extendMarkRange('link').unsetLink().run()
    setShowLinkInput(false)
  }, [editor])

  if (!editor) return null

  return (
    <div className={styles.wrapper}>
      {/* Toolbar */}
      <div className={styles.toolbar}>
        {/* Text formatting */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('bold') ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().toggleBold().run()}
            title="Bold"
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('italic') ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().toggleItalic().run()}
            title="Italic"
          >
            <em>I</em>
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('underline') ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().toggleUnderline().run()}
            title="Underline"
          >
            <u>U</u>
          </button>
        </div>

        {/* Headings */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('heading', { level: 2 }) ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            title="Heading 2"
          >
            H2
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('heading', { level: 3 }) ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            title="Heading 3"
          >
            H3
          </button>
        </div>

        {/* Lists */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('bulletList') ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            title="Bullet list"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
              <circle cx="4" cy="6" r="1" fill="currentColor" /><circle cx="4" cy="12" r="1" fill="currentColor" /><circle cx="4" cy="18" r="1" fill="currentColor" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('orderedList') ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            title="Numbered list"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="6" x2="21" y2="6" /><line x1="10" y1="12" x2="21" y2="12" /><line x1="10" y1="18" x2="21" y2="18" />
              <text x="2" y="8" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">1</text>
              <text x="2" y="14" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">2</text>
              <text x="2" y="20" fontSize="7" fill="currentColor" stroke="none" fontWeight="bold">3</text>
            </svg>
          </button>
        </div>

        {/* Alignment */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive({ textAlign: 'left' }) ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('left').run()}
            title="Align left"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="15" y2="12" /><line x1="3" y1="18" x2="18" y2="18" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive({ textAlign: 'center' }) ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('center').run()}
            title="Align center"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="6" y1="12" x2="18" y2="12" /><line x1="4" y1="18" x2="20" y2="18" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive({ textAlign: 'right' }) ? styles.toolbarBtnActive : ''}`}
            onClick={() => editor.chain().focus().setTextAlign('right').run()}
            title="Align right"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="9" y1="12" x2="21" y2="12" /><line x1="6" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </div>

        {/* Links */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${editor.isActive('link') ? styles.toolbarBtnActive : ''}`}
            onClick={() => {
              if (editor.isActive('link')) {
                removeLink()
              } else {
                setShowLinkInput(!showLinkInput)
              }
            }}
            title={editor.isActive('link') ? 'Remove link' : 'Add link'}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </button>
          {showLinkInput && (
            <div className={styles.linkInput}>
              <input
                type="url"
                placeholder="https://..."
                value={linkUrl}
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), setLink())}
              />
              <button type="button" className={styles.linkInputBtn} onClick={setLink} title="Apply link">
                ✓
              </button>
              <button type="button" className={styles.linkInputBtn} onClick={() => setShowLinkInput(false)} title="Cancel">
                ✕
              </button>
            </div>
          )}
        </div>

        {/* Undo / Redo */}
        <div className={styles.toolbarGroup}>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${!editor.can().undo() ? styles.toolbarBtnDisabled : ''}`}
            onClick={() => editor.chain().focus().undo().run()}
            disabled={!editor.can().undo()}
            title="Undo"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10h10a5 5 0 0 1 5 5v0a5 5 0 0 1-5 5H7" />
              <polyline points="7 6 3 10 7 14" />
            </svg>
          </button>
          <button
            type="button"
            className={`${styles.toolbarBtn} ${!editor.can().redo() ? styles.toolbarBtnDisabled : ''}`}
            onClick={() => editor.chain().focus().redo().run()}
            disabled={!editor.can().redo()}
            title="Redo"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10H11a5 5 0 0 0-5 5v0a5 5 0 0 0 5 5h5" />
              <polyline points="17 6 21 10 17 14" />
            </svg>
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className={styles.editor}>
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
