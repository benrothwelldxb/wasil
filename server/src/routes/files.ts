import { Router } from 'express'
import prisma from '../services/prisma.js'
import { isAuthenticated, isAdmin } from '../middleware/auth.js'

const router = Router()

// Get all folders and root-level files
router.get('/', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!

    const folders = await prisma.fileFolder.findMany({
      where: {
        schoolId: user.schoolId,
        parentId: null, // Root level folders
      },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { files: true, children: true } },
      },
    })

    const rootFiles = await prisma.schoolFile.findMany({
      where: {
        schoolId: user.schoolId,
        folderId: null, // Root level files
      },
      orderBy: { name: 'asc' },
    })

    res.json({
      folders: folders.map(folder => ({
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
        fileCount: folder._count.files,
        subfolderCount: folder._count.children,
      })),
      files: rootFiles.map(file => ({
        id: file.id,
        name: file.name,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        fileSize: file.fileSize,
        uploadedAt: file.uploadedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching files:', error)
    res.status(500).json({ error: 'Failed to fetch files' })
  }
})

// Get folder contents (subfolders and files)
router.get('/folder/:id', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { id } = req.params

    const folder = await prisma.fileFolder.findFirst({
      where: { id, schoolId: user.schoolId },
      include: {
        parent: { select: { id: true, name: true } },
      },
    })

    if (!folder) {
      return res.status(404).json({ error: 'Folder not found' })
    }

    const subfolders = await prisma.fileFolder.findMany({
      where: { parentId: id },
      orderBy: [{ order: 'asc' }, { name: 'asc' }],
      include: {
        _count: { select: { files: true, children: true } },
      },
    })

    const files = await prisma.schoolFile.findMany({
      where: { folderId: id },
      orderBy: { name: 'asc' },
    })

    // Build breadcrumb path
    const breadcrumbs = []
    let currentFolder = folder
    while (currentFolder) {
      breadcrumbs.unshift({ id: currentFolder.id, name: currentFolder.name })
      if (currentFolder.parent) {
        currentFolder = await prisma.fileFolder.findFirst({
          where: { id: currentFolder.parent.id },
          include: { parent: { select: { id: true, name: true } } },
        }) as any
      } else {
        break
      }
    }

    res.json({
      folder: {
        id: folder.id,
        name: folder.name,
        icon: folder.icon,
        color: folder.color,
      },
      breadcrumbs,
      subfolders: subfolders.map(sf => ({
        id: sf.id,
        name: sf.name,
        icon: sf.icon,
        color: sf.color,
        fileCount: sf._count.files,
        subfolderCount: sf._count.children,
      })),
      files: files.map(file => ({
        id: file.id,
        name: file.name,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        fileSize: file.fileSize,
        uploadedAt: file.uploadedAt.toISOString(),
      })),
    })
  } catch (error) {
    console.error('Error fetching folder:', error)
    res.status(500).json({ error: 'Failed to fetch folder' })
  }
})

// Search files
router.get('/search', isAuthenticated, async (req, res) => {
  try {
    const user = req.user!
    const { q } = req.query

    if (!q || typeof q !== 'string') {
      return res.json({ files: [] })
    }

    const files = await prisma.schoolFile.findMany({
      where: {
        schoolId: user.schoolId,
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { fileName: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        folder: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
      take: 20,
    })

    res.json({
      files: files.map(file => ({
        id: file.id,
        name: file.name,
        fileName: file.fileName,
        fileUrl: file.fileUrl,
        fileType: file.fileType,
        fileSize: file.fileSize,
        uploadedAt: file.uploadedAt.toISOString(),
        folder: file.folder ? { id: file.folder.id, name: file.folder.name } : null,
      })),
    })
  } catch (error) {
    console.error('Error searching files:', error)
    res.status(500).json({ error: 'Failed to search files' })
  }
})

// Create folder (admin only)
router.post('/folder', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, icon, color, parentId } = req.body

    const folder = await prisma.fileFolder.create({
      data: {
        name,
        icon: icon || null,
        color: color || null,
        parentId: parentId || null,
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: folder.id,
      name: folder.name,
      icon: folder.icon,
      color: folder.color,
    })
  } catch (error) {
    console.error('Error creating folder:', error)
    res.status(500).json({ error: 'Failed to create folder' })
  }
})

// Upload/Create file record (admin only)
router.post('/file', isAdmin, async (req, res) => {
  try {
    const user = req.user!
    const { name, fileName, fileUrl, fileType, fileSize, folderId } = req.body

    const file = await prisma.schoolFile.create({
      data: {
        name,
        fileName,
        fileUrl,
        fileType,
        fileSize,
        folderId: folderId || null,
        schoolId: user.schoolId,
      },
    })

    res.status(201).json({
      id: file.id,
      name: file.name,
      fileName: file.fileName,
      fileUrl: file.fileUrl,
      fileType: file.fileType,
      fileSize: file.fileSize,
      uploadedAt: file.uploadedAt.toISOString(),
    })
  } catch (error) {
    console.error('Error creating file:', error)
    res.status(500).json({ error: 'Failed to create file' })
  }
})

// Delete file (admin only)
router.delete('/file/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    await prisma.schoolFile.delete({
      where: { id },
    })

    res.json({ message: 'File deleted successfully' })
  } catch (error) {
    console.error('Error deleting file:', error)
    res.status(500).json({ error: 'Failed to delete file' })
  }
})

// Delete folder (admin only)
router.delete('/folder/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params

    // This will fail if folder has files or subfolders due to foreign key constraints
    // Admin should move/delete contents first
    await prisma.fileFolder.delete({
      where: { id },
    })

    res.json({ message: 'Folder deleted successfully' })
  } catch (error) {
    console.error('Error deleting folder:', error)
    res.status(500).json({ error: 'Failed to delete folder. Make sure it is empty first.' })
  }
})

export default router
