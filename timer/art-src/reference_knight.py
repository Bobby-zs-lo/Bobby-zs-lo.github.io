"""Demonstration mockups for the 4 fixes: HP bar, mounted torches, scaffolding build, knight combat."""
from PIL import Image, ImageDraw, ImageFont
import math
def lerp(a,b,t): return tuple(int(a[i]+(b[i]-a[i])*t) for i in range(3))
def R(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],fill=c)
def Ro(d,x,y,w,h,c): d.rectangle([x,y,x+w-1,y+h-1],outline=c)

CY=(0,229,255); CYd=(0,150,200); CY3=(0,95,140); ST=(196,210,224); STd=(120,140,160)
GOLD=(255,210,80); GOLDh=(255,240,170); GOLDd=(180,130,30); MG=(255,45,180); CAPE=(190,30,112); CAPEd=(128,18,80)
WHT=(238,250,255)

# ---------------- KNIGHT POSES (render each into a 56x66 RGBA) ----------------
def blade(d, x0,y0, ang, length, width, col=ST, edge=CY):
    dx,dy=math.cos(ang),math.sin(ang); px,py=-dy,dx; hw=width/2
    x1,y1=x0+dx*length,y0+dy*length
    pts=[(x0+px*hw,y0+py*hw),(x1+px*hw,y1+py*hw),(x1-px*hw,y1-py*hw),(x0-px*hw,y0-py*hw)]
    d.polygon(pts,fill=col)
    d.line([(x0+px*hw,y0+py*hw),(x1+px*hw,y1+py*hw)],fill=edge,width=max(1,int(width*0.3)))
    d.polygon([(x1+px*hw,y1+py*hw),(x1-px*hw,y1-py*hw),(x1+dx*width*0.8,y1+dy*width*0.8)],fill=col)
    d.line([(x0,y0),(x1,y1)],fill=lerp(col,(255,255,255),0.3),width=1)  # fuller

def hilt(d,x,y,ang):
    dx,dy=math.cos(ang),math.sin(ang); px,py=-dy,dx
    # crossguard
    d.line([(x-px*7,y-py*7),(x+px*7,y+py*7)],fill=GOLD,width=3)
    R(int(x-2),int(y-2),0,0,0,0) if False else None
    d.line([(x,y),(x-dx*7,y-dy*7)],fill=(150,110,40),width=3)  # grip
    d.ellipse([x-dx*8-2,y-dy*8-2,x-dx*8+2,y-dy*8+2],fill=GOLD)  # pommel

def knight_base(d, faceR=True):
    cx=28
    # cape
    d.polygon([(cx-2,18),(cx-14,52),(cx+6,46)],fill=CAPE); d.polygon([(cx-2,18),(cx-8,40),(cx+2,42)],fill=CAPEd)
    # legs + boots
    R(d,cx-7,46,7,14,CYd); R(d,cx+1,46,7,14,CYd); R(d,cx-7,46,3,14,CY); R(d,cx+1,46,3,14,CY)
    R(d,cx-8,58,9,5,(20,22,32)); R(d,cx+1,58,9,5,(20,22,32))
    # torso
    R(d,cx-9,18,18,30,CYd); R(d,cx-9,18,18,3,CY)
    for py in (24,30,36): R(d,cx-7,py,14,2,CY); R(d,cx-7,py+3,14,1,CY3)
    R(d,cx-2,18,4,30,CY3)
    R(d,cx-13,18,8,11,ST); R(d,cx+5,18,8,11,ST)  # pauldrons
    for rv in (20,24): R(d,cx-11,rv,2,2,WHT); R(d,cx+9,rv,2,2,WHT)
    # head/helm + plume
    R(d,cx-7,2,16,18,ST); R(d,cx-7,2,16,4,CY); R(d,cx-4,9,10,3,(20,25,40)); R(d,cx-4,14,10,2,(20,25,40))
    R(d,cx-4,5,10,5,(245,216,172))
    for k in range(6): R(d,cx-7+k*2,-8,2,12,MG)
    R(d,cx-5,-10,12,4,MG)
    return cx

def knight_pose(pose):
    im=Image.new("RGBA",(72,74),(0,0,0,0)); d=ImageDraw.Draw(im)
    cx=knight_base(d)
    if pose=="idle":
        # both hands on a big sword resting point-down in front
        blade(d, cx, 30, math.pi/2+0.05, 30, 6); hilt(d,cx,30,math.pi/2+0.05)
        R(d,cx-10,30,8,7,ST); R(d,cx+3,30,8,7,ST)  # gauntlets gripping
    elif pose=="bow_draw":
        # big sword stowed on back (hilt behind shoulder)
        blade(d, cx-6, 16, -1.2, 18, 4, col=STd, edge=CY3)
        # LEFT arm forward holding bow IN FRONT (toward right/monster)
        R(d,cx+6,26,12,5,ST)  # forearm forward
        # bow arc in front, to the right
        bx=cx+20
        for t in range(-9,10):
            yy=28+t; xx=bx+int(7*(1-(t/9.0)**2))
            d.point((xx,yy),fill=GOLD); d.point((xx+1,yy),fill=GOLDh)
        d.line([(bx+7,19),(bx+7,37)],fill=CY,width=1)  # string drawn
        # right hand pulling string near cheek
        R(d,cx+2,24,6,5,ST)
        # arrow nocked pointing right
        d.line([(cx+8,28),(bx+8,28)],fill=(210,180,120),width=1); d.polygon([(bx+8,26),(bx+12,28),(bx+8,30)],fill=ST)
    elif pose=="bow_loose":
        blade(d, cx-6, 16, -1.2, 18, 4, col=STd, edge=CY3)
        R(d,cx+6,26,14,5,ST)  # arm extended forward
        bx=cx+22
        for t in range(-9,10):
            yy=28+t; xx=bx+int(7*(1-(t/9.0)**2)); d.point((xx,yy),fill=GOLD)
        # released string straight
        d.line([(bx+7,19),(bx+7,37)],fill=CY,width=1)
    elif pose=="sword_ready":
        blade(d, cx+4, 30, -math.pi/2+0.15, 32, 6); hilt(d,cx+4,30,-math.pi/2+0.15)
        R(d,cx-2,28,8,7,ST); R(d,cx+4,30,8,7,ST)
    elif pose=="sword_wind":
        # raised up and back over head (anticipation)
        blade(d, cx+2, 14, -2.5, 34, 7); hilt(d,cx+2,14,-2.5)
        R(d,cx-2,12,8,7,ST); R(d,cx+2,14,8,7,ST)
    elif pose=="sword_slash":
        # swung down-forward, big slash arc
        # arc trail
        for r in range(20,30):
            for a in range(-60,40,4):
                an=math.radians(a); xx=cx+2+int(r*math.cos(an)); yy=18+int(r*math.sin(an))
                col=WHT if r>26 else CY
                d.point((xx,yy),fill=col)
        blade(d, cx+2, 18, 0.5, 34, 7); hilt(d,cx+2,18,0.5)
        R(d,cx-1,18,8,7,ST); R(d,cx+4,20,8,7,ST)
    elif pose=="sword_follow":
        blade(d, cx+2, 24, 0.9, 32, 6); hilt(d,cx+2,24,0.9)
        for a in range(10,70,5):
            an=math.radians(a); xx=cx+2+int(24*math.cos(an)); yy=22+int(24*math.sin(an)); d.point((xx,yy),fill=CY)
        R(d,cx-1,24,8,7,ST); R(d,cx+4,26,8,7,ST)
    elif pose=="magic":
        blade(d, cx-6, 16, -1.2, 18, 4, col=STd, edge=CY3)
        R(d,cx+5,22,10,5,ST)  # arm raised forward
        ox,oy=cx+20,22
        for r in range(9,0,-1): d.ellipse([ox-r,oy-r,ox+r,oy+r],fill=lerp((40,10,60),CY,r/9))
        d.ellipse([ox-4,oy-4,ox+4,oy+4],fill=WHT)
        for a in range(0,360,45):
            an=math.radians(a); d.point((ox+int(11*math.cos(an)),oy+int(11*math.sin(an))),fill=MG)
            d.point((ox+int(13*math.cos(an+0.3)),oy+int(13*math.sin(an+0.3))),fill=CY)
    return im

# ---------------- BEAST (hurt) small ----------------
def beast_img():
    im=Image.new("RGBA",(96,92),(0,0,0,0)); d=ImageDraw.Draw(im)
    b1=(212,150,255); b2=(178,108,236); b3=(132,66,196); be=(232,192,255)
    R(d,18,74,16,16,b3); R(d,54,74,16,16,b3)
    R(d,8,30,76,48,b1); R(d,8,30,76,4,be); R(d,8,30,7,48,b2); R(d,77,30,7,48,b3)
    R(d,26,48,40,24,be)
    R(d,20,-2,52,36,b1); R(d,20,-2,52,4,be)
    d.polygon([(22,-2),(14,-30),(36,0)],fill=b1); d.polygon([(70,-2),(78,-30),(56,0)],fill=b1)
    d.line([(28,10),(42,22)],fill=(32,16,48),width=3); d.line([(28,22),(42,10)],fill=(32,16,48),width=3)
    R(d,50,12,16,7,(255,210,0)); R(d,54,13,5,5,(32,16,48))
    R(d,30,26,34,9,(170,30,62))
    for i in range(0,34,5): R(d,30+i,26,3,9,(255,242,242))
    R(d,46,52,3,18,b3)
    return im

# ---------------- shared bg ----------------
def scene_bg(W,H,skyt,skyb,sunt,sunb,grid):
    img=Image.new("RGB",(W,H),skyt); d=ImageDraw.Draw(img)
    horizon=int(H*0.84)
    for y in range(horizon): d.line([(0,y),(W,y)],fill=lerp(skyt,skyb,y/horizon))
    sx,sy,sr=W//2,int(H*0.26),int(min(W,H)*0.16)
    for dy in range(-sr,sr):
        dx=int(math.sqrt(max(0,sr*sr-dy*dy)))
        if dx==0: continue
        if dy>0 and ((dy-1)//4)%2==1: continue
        d.line([(sx-dx,sy+dy),(sx+dx,sy+dy)],fill=lerp(sunt,sunb,(dy+sr)/(2*sr)))
    R(d,0,horizon,W,H-horizon,lerp(skyt,(6,4,12),0.6))
    vp=(W//2,horizon)
    for gx in range(-10,11): d.line([vp,(W//2+gx*40,H)],fill=grid)
    yy=horizon; step=6
    while yy<H: d.line([(0,yy),(W,yy)],fill=grid); yy+=step; step=int(step*1.4)+1
    return img,d,horizon

def scan(img):
    o=Image.new("RGBA",img.size,(0,0,0,0)); dd=ImageDraw.Draw(o)
    for y in range(0,img.size[1],2): dd.line([(0,y),(img.size[0],y)],fill=(0,0,0,46))
    img=img.convert("RGBA"); img.alpha_composite(o); return img.convert("RGB")

def paste(base,im,x,y,sc):
    s=im.resize((im.width*sc,im.height*sc),Image.NEAREST); base.paste(s,(x,y),s)

# ================= IMAGE 1: BATTLE with fixed HP bar + big sword =================
def battle_fixed():
    W,H=240,360
    img,d,horizon=scene_bg(W,H,(26,11,46),(0,180,205),(255,225,80),(255,90,0),(0,150,140))
    # clock top-left (its own corner)
    R(d,8,8,84,22,(20,8,40)); Ro(d,8,8,84,22,CY)
    d.text((14,13),"00:43",fill=CY)  # placeholder text (real uses pixel font)
    # beast on right, grounded
    bi=beast_img(); beast_h=bi.height; paste(img,bi, 150, horizon-beast_h+2, 1)
    # BOSS HP BAR above the monster (clear of clock)
    bx=150+8; by=horizon-beast_h-16; bw=80
    d.rectangle([bx-2,by-2,bx+bw+2,by+9],outline=MG); R(d,bx,by,bw,7,(40,16,40)); R(d,bx,by,int(bw*0.34),7,MG)
    R(d,bx-12,by-3,10,11,(232,232,242)); R(d,bx-10,by,2,2,(20,10,30)); R(d,bx-6,by,2,2,(20,10,30))
    # knight mid big-sword slash, grounded
    ki=knight_pose("sword_slash"); paste(img,ki, 26, horizon-ki.height+2, 1)
    return scan(img)

# ================= IMAGE 2: KNIGHT FRAME STRIP =================
def knight_strip():
    poses=[("idle","IDLE"),("bow_draw","BOW DRAW (bow in front)"),("bow_loose","BOW LOOSE"),
           ("sword_ready","SWORD READY"),("sword_wind","WINDUP"),("sword_slash","SLASH"),
           ("sword_follow","FOLLOW"),("magic","MAGIC")]
    sc=5; cw=72*sc; ch=74*sc; gap=16; lab=30
    W=gap+len(poses)*(cw+gap); Hh=lab+ch+gap
    sheet=Image.new("RGB",(W,Hh),(22,16,34)); sd=ImageDraw.Draw(sheet)
    try: f=ImageFont.truetype("arialbd.ttf",18)
    except: f=ImageFont.load_default()
    x=gap
    for pose,lblt in poses:
        # checker bg per cell
        cell=Image.new("RGB",(72,74),(30,24,46)); cd=ImageDraw.Draw(cell)
        for yy in range(0,74,8):
            for xx in range(0,72,8):
                if (xx//8+yy//8)%2==0: cd.rectangle([xx,yy,xx+7,yy+7],fill=(38,30,56))
        ki=knight_pose(pose); cell.paste(ki,(0,0),ki)
        big=cell.resize((cw,ch),Image.NEAREST)
        sheet.paste(big,(x,lab)); sd.text((x+2,6),lblt,font=f,fill=CY)
        x+=cw+gap
    return sheet

# ================= IMAGE 3: CASTLE SCAFFOLDING BUILD STRIP =================
BR=[(132,108,168),(104,82,138),(78,58,108)]; MOR=(38,24,56); HIL=(186,156,224); WOOD=(150,96,54); WOODd=(96,60,34)
def castle_stage(frac):
    W,H=240,180; img=Image.new("RGB",(W,H),(43,12,61)); d=ImageDraw.Draw(img)
    horizon=int(H*0.82)
    for y in range(horizon): d.line([(0,y),(W,y)],fill=lerp((43,12,61),(255,94,148),y/horizon))
    R(d,0,horizon,W,H-horizon,(28,8,42))
    vp=(W//2,horizon)
    for gx in range(-8,9): d.line([vp,(W//2+gx*40,H)],fill=(150,40,110))
    # castle footprint
    cx,cw=40,160; full_h=130; base=horizon
    # discrete courses (chunks)
    course_h=10; n_courses=full_h//course_h
    built=int(round(frac*n_courses))
    def brickrow(y):
        for bx in range(cx,cx+cw,12):
            tone=BR[(bx//12+y)%2]
            R(d,bx,y,12,course_h,tone); R(d,bx,y,12,1,HIL); R(d,bx,y+course_h-1,12,1,MOR)
        R(d,cx,y,2,course_h,HIL)
    for c in range(built):
        brickrow(base-(c+1)*course_h)
    # towers (build with the courses, a bit taller)
    for tx in (cx-8,cx+cw-12):
        tb=int(round(frac*(n_courses+2)))
        for c in range(tb):
            R(d,tx,base-(c+1)*course_h,20,course_h,BR[1]); R(d,tx,base-(c+1)*course_h,20,1,HIL); R(d,tx,base-(c+1)*course_h+course_h-1,20,1,MOR)
    # mounted torches on built lower wall (only if that height built)
    for txp in (cx+18,cx+cw-22):
        ty=base-30
        if built*course_h>=40:
            R(d,txp,ty,2,7,WOOD); R(d,txp-1,ty-5,4,5,(255,140,40)); R(d,txp,ty-8,2,3,GOLD)
    # SCAFFOLDING around the section under construction (top built course)
    if frac<0.99:
        sy=base-built*course_h
        # vertical poles
        for polex in (cx-6,cx+cw+2):
            d.line([(polex,sy-26),(polex,base)],fill=WOOD)
            d.line([(polex+1,sy-26),(polex+1,base)],fill=WOODd)
        # planks (platform builder stands on)
        plankY=sy-4
        R(d,cx-6,plankY,cw+10,3,WOOD); R(d,cx-6,plankY,cw+10,1,(190,140,90))
        R(d,cx-6,sy-16,cw+10,2,WOODd)
        # cross braces
        for bxp in range(cx,cx+cw,30): d.line([(bxp,sy-26),(bxp+20,base)],fill=WOODd)
        # builder standing ON the plank (grounded, not floating)
        wx=cx+cw//2-6
        R(d,wx,plankY-13,12,13,(58,140,182)); R(d,wx,plankY-13,12,3,(120,205,238))
        R(d,wx+2,plankY-20,8,7,(245,212,165)); R(d,wx+1,plankY-23,10,4,(214,62,62))
        R(d,wx+11,plankY-20,3,9,WOOD); R(d,wx+12,plankY-23,6,5,(150,150,162))  # hammer
    else:
        # finished: battlements + flag
        for i in range(cx,cx+cw,16): R(d,i,base-full_h-6,8,6,BR[1])
    # flagpole + climbing flag (height ~ frac)
    px=cx+cw+10; ptop=base-150; R(d,px,ptop,2,base-ptop,(206,206,222))
    fy=ptop+int((base-ptop)*(1-frac))
    d.polygon([(px+2,fy),(px+24,fy+7),(px+2,fy+14)],fill=GOLD)
    return scan(img)

def castle_strip():
    fracs=[(0.18,"~start (scaffold up, chunk by chunk)"),(0.45,"~45%"),(0.72,"~72%"),(1.0,"complete")]
    sc=3; cw=240*sc; ch=180*sc; gap=16; lab=28
    W=gap+len(fracs)*(cw+gap); Hh=lab+ch+gap
    sheet=Image.new("RGB",(W,Hh),(22,16,34)); sd=ImageDraw.Draw(sheet)
    try: f=ImageFont.truetype("arialbd.ttf",18)
    except: f=ImageFont.load_default()
    x=gap
    for fr,lbl in fracs:
        big=castle_stage(fr).resize((cw,ch),Image.NEAREST)
        sheet.paste(big,(x,lab)); sd.text((x+2,6),lbl,font=f,fill=GOLD)
        x+=cw+gap
    return sheet

OUT=r"C:\Users\Bobby\AppData\Local\Temp\claude\C--Users-Bobby-OneDrive-Dokumenter-GitHub-8-bit-timer\880c6e84-dcdf-466d-9865-d382b47be2e4\scratchpad"
b=battle_fixed().resize((240*3,360*3),Image.NEAREST); b.save(OUT+r"\fix_battle.png"); print("battle")
knight_strip().save(OUT+r"\fix_knight.png"); print("knight")
castle_strip().save(OUT+r"\fix_castle.png"); print("castle")
