import fs from 'fs/promises'
import JSZip from 'jszip'

const zip = await JSZip.loadAsync(await fs.readFile('../uploads/Залікова 5 бал  РПЗ 23 2 .docx'))
const xml = await zip.file('word/document.xml').async('string')
const text = xml.split('<w:t').slice(1).map((part) => part.split('>')[1]?.split('</w:t>')[0] || '')
console.log(text.join(' | '))
