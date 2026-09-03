import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactUsRepository } from '@poojawala/repositories';
import { CreateContactUsDto, GetAllContactUsDto, UpdateContactUsStatusDto } from '@poojawala/dtos';

@Injectable()
export class ContactUsService {
  constructor(private readonly contactUsRepo: ContactUsRepository) {}

  async create(dto: CreateContactUsDto) {
    const contactUs = await this.contactUsRepo.create(dto);
    return {
      success: true,
      message: 'Your message has been submitted successfully.',
      data: contactUs,
    };
  }

  async getAll(query: GetAllContactUsDto) {
    const { page, limit, search, status } = query;
    const result = await this.contactUsRepo.getAll(page, limit, search, status);

    return {
      success: true,
      message: 'Contact messages fetched successfully',
      ...result,
    };
  }

  async getById(id: number) {
    const contactUs = await this.contactUsRepo.getById(id);

    if (!contactUs) {
      throw new NotFoundException('Contact message not found');
    }

    return {
      success: true,
      message: 'Contact message fetched successfully',
      data: contactUs,
    };
  }

  async updateStatus(id: number, dto: UpdateContactUsStatusDto) {
    const contactUs = await this.contactUsRepo.getById(id);

    if (!contactUs) {
      throw new NotFoundException('Contact message not found');
    }

    const updated = await this.contactUsRepo.updateStatus(id, dto.status);

    return {
      success: true,
      message: 'Contact message status updated successfully',
      data: updated,
    };
  }

  async softDelete(id: number) {
    const contactUs = await this.contactUsRepo.getById(id);

    if (!contactUs) {
      throw new NotFoundException('Contact message not found');
    }

    await this.contactUsRepo.softDelete(id);

    return {
      success: true,
      message: 'Contact message deleted successfully',
    };
  }
}
