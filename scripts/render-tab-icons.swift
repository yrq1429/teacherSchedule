import AppKit

// Deterministic raster exports of the repository's 24-unit vector icon designs.
let names = ["schedule", "feedback", "stats", "profile"]
for name in names {
    for active in [false, true] {
        let context = CGContext(data: nil, width: 81, height: 81, bitsPerComponent: 8,
            bytesPerRow: 81 * 4, space: CGColorSpaceCreateDeviceRGB(),
            bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
        context.translateBy(x: 0, y: 81)
        context.scaleBy(x: 81.0 / 24, y: -81.0 / 24)
        let rgb: [CGFloat] = active ? [38,55,70] : [139,146,150]
        context.setStrokeColor(CGColor(red: rgb[0]/255, green: rgb[1]/255, blue: rgb[2]/255, alpha: 1))
        context.setLineWidth(active ? 1.9 : 1.65)
        context.setLineCap(.round)
        context.setLineJoin(.round)
        func line(_ points: [(CGFloat, CGFloat)]) {
            context.move(to: CGPoint(x: points[0].0, y: points[0].1))
            for p in points.dropFirst() { context.addLine(to: CGPoint(x: p.0, y: p.1)) }
        }
        switch name {
        case "schedule":
            context.addPath(CGPath(roundedRect: CGRect(x:4,y:5,width:16,height:16), cornerWidth:3, cornerHeight:3, transform:nil))
            line([(8,3),(8,7)]); line([(16,3),(16,7)]); line([(4,10),(20,10)])
            line([(8,14),(10,14)]); line([(14,14),(16,14)]); line([(8,17),(10,17)])
        case "feedback":
            context.move(to: CGPoint(x:8,y:20)); context.addLine(to: CGPoint(x:5,y:20))
            context.addQuadCurve(to: CGPoint(x:3,y:18), control: CGPoint(x:3,y:20))
            context.addLine(to: CGPoint(x:3,y:6))
            context.addQuadCurve(to: CGPoint(x:5,y:4), control: CGPoint(x:3,y:4))
            context.addLine(to: CGPoint(x:16,y:4))
            context.addQuadCurve(to: CGPoint(x:18,y:6), control: CGPoint(x:18,y:4))
            context.addLine(to: CGPoint(x:18,y:9))
            line([(7,8),(14,8)]); line([(7,12),(11,12)])
            line([(13,20),(14,16),(19,11),(22,14),(17,19),(13,20)])
            line([(18,12),(21,15)])
        case "stats":
            line([(4,4),(4,20),(21,20)])
            line([(8,16),(8,12)]); line([(13,16),(13,8)]); line([(18,16),(18,5)])
        default:
            context.addEllipse(in: CGRect(x:8,y:4,width:8,height:8))
            context.move(to: CGPoint(x:4,y:21)); context.addLine(to: CGPoint(x:4,y:19))
            context.addCurve(to: CGPoint(x:20,y:19), control1: CGPoint(x:4,y:8.33), control2: CGPoint(x:20,y:8.33))
            context.addLine(to: CGPoint(x:20,y:21))
        }
        context.strokePath()
        let image = NSBitmapImageRep(cgImage: context.makeImage()!)
        let suffix = active ? "-active" : ""
        let data = image.representation(using: .png, properties: [:])!
        try data.write(to: URL(fileURLWithPath: "miniprogram/images/tab-\(name)\(suffix)-v3.png"))
    }
}
