"""
Empaqueta una carpeta en un .zip usando SIEMPRE '/' como separador.

No se usa Compress-Archive de PowerShell: en Windows escribe los nombres
con '\' y eso viola la especificacion ZIP (APPNOTE 4.4.17: los separadores
son '/'). Netlify corre en Linux y ve un unico archivo llamado
"netlify\\functions\\api.mjs" en la raiz, sin carpeta public/ ni funciones,
y el deploy falla en Initializing.

    python scripts/zip.py <carpeta> <salida.zip>
"""
import os
import sys
import zipfile

origen = sys.argv[1]
salida = sys.argv[2]

archivos = []
for dp, dn, fn in os.walk(origen):
    dn[:] = [d for d in dn if d not in ('.git', 'node_modules', '.netlify')]
    for f in fn:
        ruta = os.path.join(dp, f)
        rel = os.path.relpath(ruta, origen).replace(os.sep, '/')
        archivos.append((ruta, rel))

with zipfile.ZipFile(salida, 'w', zipfile.ZIP_DEFLATED) as z:
    for ruta, rel in sorted(archivos, key=lambda x: x[1]):
        z.write(ruta, rel)

# Comprobacion: ni un solo nombre puede llevar backslash.
with zipfile.ZipFile(salida) as z:
    malos = [n for n in z.namelist() if '\\' in n]
    if malos:
        print('ERROR: nombres con backslash: %s' % malos[:3])
        sys.exit(1)
    print('  %d archivos, separadores correctos' % len(z.namelist()))
