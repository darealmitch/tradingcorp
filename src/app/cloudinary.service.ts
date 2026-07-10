import { Injectable } from '@angular/core';
import { Cloudinary } from '@cloudinary/url-gen';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class CloudinaryService {
  cld = new Cloudinary({
    cloud: {
      cloudName: environment.cloudinaryCloudName,
    },
  });
}
